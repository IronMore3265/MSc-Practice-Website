import tempfile
import unittest
from pathlib import Path

from pdfimport.config import Settings
from pdfimport.extract import extract_pdf
from pdfimport.review import ReviewApp
from pdfimport.store import Workdir
from tests import sample_pdf


class ReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        pdf = root / "s.pdf"
        sample_pdf.build(pdf)
        wd = Workdir(root / "w")
        extract_pdf(pdf, "Test", 1, None, wd, Settings(), log=lambda *_: None)
        self.app = ReviewApp(wd)

    def tearDown(self):
        self.app.doc.close()
        self.tmp.cleanup()

    def test_status_and_edits_persist(self):
        key = self.app.manifest["figures"][0]["key"]
        self.app.update(key, {"status": "approved", "label": " Figure 9.9 ", "caption": ""})
        saved = self.app.workdir.load()["figures"][0]
        self.assertEqual((saved["status"], saved["label"], saved["caption"]), ("approved", "Figure 9.9", None))
        with self.assertRaises(ValueError):
            self.app.update(key, {"status": "bogus"})

    def test_resizing_recuts_from_the_pdf(self):
        fig = next(f for f in self.app.manifest["figures"] if f["source"] == "embedded")
        self.app.update(fig["key"], {"bbox": [90, 190, 320, 340]})
        self.assertEqual(fig["source"], "render")
        self.assertEqual(fig["bbox"], [90.0, 190.0, 320.0, 340.0])
        self.assertTrue((self.app.workdir.path / fig["file"]).exists())
        with self.assertRaises(ValueError):
            self.app.update(fig["key"], {"bbox": [90, 190, 92, 192]})

    def test_draw_a_missed_figure_finds_its_caption(self):
        fig = self.app.create({"page": 2, "bbox": [58, 198, 472, 262]})
        self.assertEqual((fig["kind"], fig["status"], fig["label"]), ("manual", "approved", "Figure 1.2"))

    def test_merge_two_pieces(self):
        p4 = [f for f in self.app.manifest["figures"] if f["page"] == 4]
        keys = [f["key"] for f in p4]
        merged = self.app.merge(keys)
        self.assertEqual(len([f for f in self.app.manifest["figures"] if f["page"] == 4]), 1)
        self.assertEqual(merged["kind"], "mixed")
        self.assertLessEqual(merged["bbox"][0], min(f["bbox"][0] for f in p4))
        for f in p4[1:]:
            self.assertFalse((self.app.workdir.path / f["file"]).exists())
        with self.assertRaises(ValueError):
            self.app.merge([merged["key"]])

    def test_page_preview(self):
        self.assertTrue(self.app.page_png(1).startswith(b"\x89PNG"))


if __name__ == "__main__":
    unittest.main()
