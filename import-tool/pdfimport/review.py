"""Local review screen. A small web server on 127.0.0.1 that shows each page with its detected figures.

Every edit is saved to the work folder at once. Nothing leaves the laptop until the upload command runs.
"""
import hashlib
import json
import re
import secrets
import threading
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import fitz

from . import extract, render
from .config import Settings
from .store import Workdir

STATIC = Path(__file__).parent / "static"
MIN_BOX = 8.0  # points
STATUSES = {"pending", "approved", "rejected"}


class ReviewApp:
    def __init__(self, workdir: Workdir):
        self.workdir = workdir
        self.manifest = workdir.load()
        self.settings = Settings.from_dict(self.manifest.get("settings", {}))
        pdf = Path(self.manifest["pdf"]["path"])
        if not pdf.exists():
            raise FileNotFoundError(f"The source PDF is missing: {pdf}. Figures cannot be re-cut without it.")
        self.doc = render.open_pdf(pdf)
        self.lock = threading.Lock()  # PyMuPDF is not thread safe
        self.token = secrets.token_urlsafe(16)
        workdir.previews_dir.mkdir(exist_ok=True)

    # -- state ---------------------------------------------------------------
    def public_state(self) -> dict:
        m = self.manifest
        return {
            "course": m["course"], "chapter": m["chapter"], "title": m.get("title"),
            "pdf": m["pdf"]["filename"], "pages": m["pages"], "warnings": m.get("warnings", []), "dpi": self.settings.dpi,
            "figures": [{k: v for k, v in f.items() if not k.startswith("_")} for f in m["figures"]],
        }

    def figure(self, key: str) -> dict:
        for f in self.manifest["figures"]:
            if f["key"] == key:
                return f
        raise KeyError(key)

    def save(self) -> None:
        self.workdir.save(self.manifest)

    # -- images --------------------------------------------------------------
    def page_png(self, number: int) -> bytes:
        if not 1 <= number <= len(self.doc):
            raise KeyError(number)
        cache = self.workdir.previews_dir / f"page-{number:03d}.png"
        if cache.exists():
            return cache.read_bytes()
        with self.lock:
            pix = self.doc[number - 1].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            data = pix.tobytes("png")
        cache.write_bytes(data)
        return data

    def rerender(self, fig: dict, bbox) -> None:
        """Re-cut a figure from the PDF at the new box. Always a render: the pixels come from the original page."""
        with self.lock:
            page = self.doc[fig["page"] - 1]
            rect = render.clamp_bbox(page, bbox)
            if rect.width < MIN_BOX or rect.height < MIN_BOX:
                raise ValueError("The box is too small.")
            data, w, h = render.render_clip(page, rect, self.settings)
        old = self.workdir.path / fig["file"] if fig.get("file") else None
        path = self.workdir.figures_dir / f"{fig['key']}.png"
        self.workdir.figures_dir.mkdir(exist_ok=True)
        path.write_bytes(data)
        if old and old != path and old.exists():
            old.unlink()
        fig.update(
            bbox=[round(v, 2) for v in tuple(rect)], source="render", file=f"figures/{path.name}",
            mime_type="image/png", width=w, height=h, sha256=hashlib.sha256(data).hexdigest(),
        )

    # -- edits ---------------------------------------------------------------
    def update(self, key: str, body: dict) -> dict:
        fig = self.figure(key)
        if "status" in body:
            if body["status"] not in STATUSES:
                raise ValueError("Unknown status.")
            fig["status"] = body["status"]
        for field in ("label", "caption"):
            if field in body:
                value = (body[field] or "").strip()
                fig[field] = value[:400] or None
        if "bbox" in body:
            bbox = [float(v) for v in body["bbox"]]
            if len(bbox) != 4:
                raise ValueError("bbox needs four numbers.")
            self.rerender(fig, bbox)
        self.save()
        return fig

    def create(self, body: dict) -> dict:
        page_no = int(body["page"])
        bbox = [float(v) for v in body["bbox"]]
        with self.lock:
            blocks = extract.text_blocks(self.doc[page_no - 1])
        cap = extract.find_caption(blocks, tuple(bbox), self.settings.caption_gap, set())
        fig = {
            "key": uuid.uuid4().hex[:12], "page": page_no, "kind": "manual",
            "label": cap["label"] if cap else None, "caption": cap["caption"] if cap else None,
            "status": "approved", "bbox": bbox, "source": "render",
        }
        self.rerender(fig, bbox)
        self.manifest["figures"].append(fig)
        self.save()
        return fig

    def merge(self, keys: list[str]) -> dict:
        figs = [self.figure(k) for k in keys]
        if len(figs) < 2 or len({f["page"] for f in figs}) != 1:
            raise ValueError("Pick two or more figures on the same page.")
        first = figs[0]
        box = tuple(first["bbox"])
        for f in figs[1:]:
            box = extract.union(box, tuple(f["bbox"]))
        first["label"] = next((f["label"] for f in figs if f.get("label")), None)
        first["caption"] = next((f["caption"] for f in figs if f.get("caption")), None)
        first["kind"] = "mixed"
        first["status"] = "approved"
        self.rerender(first, box)
        for f in figs[1:]:
            path = self.workdir.path / f["file"]
            if path.exists():
                path.unlink()
            self.manifest["figures"].remove(f)
        self.save()
        return first

    def approve_pending(self) -> int:
        n = 0
        for f in self.manifest["figures"]:
            if f["status"] == "pending":
                f["status"] = "approved"
                n += 1
        self.save()
        return n

    def set_title(self, title: str) -> None:
        self.manifest["title"] = title.strip()[:120] or None
        self.save()


def make_handler(app: ReviewApp, port: int):
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        server_version = "pdfimport"

        def log_message(self, *args):  # keep the terminal quiet
            pass

        def send(self, code: int, body: bytes, ctype: str, cache: str = "no-store") -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache)
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, data, code: int = 200) -> None:
            self.send(code, json.dumps(data).encode(), "application/json")

        def host_ok(self) -> bool:
            if self.headers.get("Host") in hosts:
                return True
            self.send_json({"error": "Bad host."}, 403)
            return False

        def do_GET(self):
            if not self.host_ok():
                return
            path = unquote(urlparse(self.path).path)
            try:
                if path == "/":
                    html = (STATIC / "review.html").read_text(encoding="utf-8").replace("__TOKEN__", app.token)
                    return self.send(200, html.encode(), "text/html; charset=utf-8")
                if path == "/api/state":
                    return self.send_json(app.public_state())
                m = re.fullmatch(r"/page/(\d+)\.png", path)
                if m:
                    return self.send(200, app.page_png(int(m.group(1))), "image/png", "max-age=3600")
                m = re.fullmatch(r"/figure/([0-9a-f]+)", path)
                if m:
                    fig = app.figure(m.group(1))
                    return self.send(200, (app.workdir.path / fig["file"]).read_bytes(), fig["mime_type"])
            except (KeyError, FileNotFoundError):
                pass
            self.send_json({"error": "Not found."}, 404)

        def do_POST(self):
            if not self.host_ok():
                return
            if self.headers.get("X-Token") != app.token:
                return self.send_json({"error": "Bad token."}, 403)
            path = urlparse(self.path).path
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}")
                with_fig = re.fullmatch(r"/api/figure/([0-9a-f]+)", path)
                if with_fig:
                    return self.send_json(app.update(with_fig.group(1), body))
                if path == "/api/figure":
                    return self.send_json(app.create(body))
                if path == "/api/merge":
                    return self.send_json(app.merge(body["keys"]))
                if path == "/api/approve-pending":
                    return self.send_json({"approved": app.approve_pending()})
                if path == "/api/title":
                    app.set_title(body.get("title", ""))
                    return self.send_json({"ok": True})
            except KeyError:
                return self.send_json({"error": "Not found."}, 404)
            except (ValueError, TypeError, json.JSONDecodeError) as e:
                return self.send_json({"error": str(e)}, 400)
            self.send_json({"error": "Not found."}, 404)

    return Handler


def serve(workdir: Workdir, port: int = 8765, open_browser: bool = True, log=print) -> None:
    app = ReviewApp(workdir)
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app, port))
    url = f"http://127.0.0.1:{port}/"
    log(f"Review screen: {url}   (Ctrl+C to stop; edits are saved as you go)")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
