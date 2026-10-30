import hashlib
import tempfile
import unittest
from pathlib import Path

import fitz

from pdfimport.config import Settings
from pdfimport.extract import extract_pdf
from pdfimport.store import Workdir
from tests import sample_pdf


class ExtractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        cls.pdf = cls.root / "sample.pdf"
        sample_pdf.build(cls.pdf)
        cls.workdir = Workdir(cls.root / "work")
        cls.manifest = extract_pdf(cls.pdf, "Test", 1, "Intro", cls.workdir, Settings(), log=lambda *_: None)
        cls.by_page = {}
        for f in cls.manifest["figures"]:
            cls.by_page.setdefault(f["page"], []).append(f)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_figure_counts_per_page(self):
        # Logo on every page, header and footer rules, and the shaded callout on page 3 are not figures.
        self.assertEqual({p: len(v) for p, v in self.by_page.items()}, {1: 1, 2: 1, 4: 2})

    def test_plain_image_is_the_original_bytes(self):
        fig = self.by_page[1][0]
        self.assertEqual((fig["kind"], fig["source"]), ("raster", "embedded"))
        doc = fitz.open(self.pdf)
        info = [i for i in doc[0].get_image_info(xrefs=True) if i["width"] == 200][0]
        original = doc.extract_image(info["xref"])["image"]
        saved = (self.workdir.path / fig["file"]).read_bytes()
        self.assertEqual(saved, original)
        self.assertEqual(fig["sha256"], hashlib.sha256(original).hexdigest())

    def test_vector_diagram_is_rendered_with_caption(self):
        fig = self.by_page[2][0]
        self.assertEqual((fig["kind"], fig["source"], fig["label"]), ("vector", "render", "Figure 1.2"))
        self.assertIn("Process flow", fig["caption"])
        self.assertGreater(fig["bbox"][3], 262)  # the crop reaches down to the caption line
        self.assertGreaterEqual(fig["width"], 1500)  # about 300 DPI

    def test_table_and_labelled_image_on_page_4(self):
        kinds = {f["kind"]: f for f in self.by_page[4]}
        self.assertEqual(kinds["vector"]["label"], "Table 1.1")
        self.assertEqual(kinds["mixed"]["source"], "render")  # text drawn on the image: needs a render

    def test_text_per_page(self):
        pages = self.workdir.load_pages()
        self.assertEqual(len(pages), 4)
        self.assertIn("Procurement is the process", pages[0]["text"])
        self.assertNotIn("\x00", "".join(p["text"] for p in pages))

    def test_second_extract_needs_force(self):
        with self.assertRaises(FileExistsError):
            extract_pdf(self.pdf, "Test", 1, None, self.workdir, Settings(), log=lambda *_: None)

    def test_keep_repeated_includes_logo(self):
        wd = Workdir(self.root / "work2")
        m = extract_pdf(self.pdf, "Test", 1, None, wd, Settings(keep_repeated=True), log=lambda *_: None)
        self.assertGreater(len(m["figures"]), 4)


if __name__ == "__main__":
    unittest.main()
