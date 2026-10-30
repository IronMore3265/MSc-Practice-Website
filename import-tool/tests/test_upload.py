"""Runs the upload against a fake Supabase that records every request."""
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

from pdfimport import upload as up
from pdfimport.config import Settings
from pdfimport.extract import extract_pdf
from pdfimport.store import Workdir
from tests import sample_pdf

REMOTE_FIGURES = [
    {"import_key": "gone0001", "blob_path": "course-1/01/gone0001.png"},
]


class Fake(BaseHTTPRequestHandler):
    log: list = []

    def log_message(self, *a):
        pass

    def reply(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_any(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n)
        is_json = "json" in (self.headers.get("Content-Type") or "")
        body = json.loads(raw) if raw and is_json else raw
        Fake.log.append((self.command, self.path, body, dict(self.headers)))
        table = self.path.split("?")[0].rsplit("/", 1)[-1]
        if self.command == "GET":
            return self.reply({"course": [{"id": "course-1"}], "chapter": [{"id": "chap-1", "title": "Chapter 1"}], "figure": REMOTE_FIGURES}[table])
        if self.path.startswith("/storage/"):
            return self.reply({"ok": True})
        if table == "source_pdf":
            return self.reply([{"id": "pdf-1"}], 201)
        return self.reply([], 201)

    do_GET = do_POST = do_PATCH = do_DELETE = handle_any


class UploadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        pdf = root / "s.pdf"
        sample_pdf.build(pdf)
        self.wd = Workdir(root / "w")
        m = extract_pdf(pdf, "Test", 1, "Intro to sourcing", self.wd, Settings(), log=lambda *_: None)
        # approve three, reject one, leave one pending
        m["figures"] = m["figures"][:4]
        for f, s in zip(m["figures"], ["approved", "approved", "rejected", "pending"]):
            f["status"] = s
        self.wd.save(m)
        self.server = HTTPServer(("127.0.0.1", 0), Fake)
        Fake.log = []
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.env = {"SUPABASE_URL": f"http://127.0.0.1:{self.server.server_port}", "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_test"}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def test_upload_sends_only_approved_figures_and_cleans_up(self):
        with mock.patch.object(up, "load_env", return_value=self.env):
            up.upload(self.wd, log=lambda *_: None)
        log = Fake.log
        puts = [e for e in log if e[0] == "POST" and e[1].startswith("/storage/")]
        self.assertEqual(len(puts), 2)
        self.assertTrue(all(e[1].startswith("/storage/v1/object/figures/course-1/01/") for e in puts))
        self.assertTrue(all(e[3].get("x-upsert") == "true" for e in puts))

        pdf_post = next(e for e in log if e[1].startswith("/rest/v1/source_pdf"))
        self.assertIn("on_conflict=chapter_id", pdf_post[1])
        self.assertEqual(pdf_post[2]["figures_pending"], 1)
        self.assertEqual(pdf_post[2]["review_status"], "in_review")
        self.assertEqual(pdf_post[2]["page_count"], 4)

        fig_posts = [e for e in log if e[0] == "POST" and e[1].startswith("/rest/v1/figure")]
        self.assertEqual(len(fig_posts), 2)
        self.assertTrue(all(e[2]["pdf_id"] == "pdf-1" and e[2]["chapter_id"] == "chap-1" for e in fig_posts))

        text_post = next(e for e in log if e[1].startswith("/rest/v1/page_text"))
        self.assertEqual([r["page"] for r in text_post[2]], [1, 2, 3, 4])

        patch = next(e for e in log if e[0] == "PATCH")
        self.assertEqual(patch[2], {"title": "Intro to sourcing"})

        deletes = [e for e in log if e[0] == "DELETE"]
        self.assertTrue(any("figure" in e[1] and "gone0001" in e[1] for e in deletes))
        storage_delete = next(e for e in deletes if e[1].startswith("/storage/"))
        self.assertEqual(storage_delete[2], {"prefixes": ["course-1/01/gone0001.png"]})

        # Key style: sb_secret_ keys go in apikey only.
        self.assertEqual(log[0][3].get("apikey"), "sb_secret_test")
        self.assertNotIn("Authorization", log[0][3])

    def test_dry_run_sends_nothing(self):
        up.upload(self.wd, dry_run=True, log=lambda *_: None)
        self.assertEqual(Fake.log, [])


if __name__ == "__main__":
    unittest.main()
