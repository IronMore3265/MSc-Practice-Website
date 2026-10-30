"""Text per page and figure detection.

Figures are 1:1 copies, never redrawn. A region that is a single plain image is saved with its original bytes.
Anything else (vector diagrams, tables drawn from lines, images with labels on top) is rendered from the PDF
at high resolution, so the pixels come from the original drawing.
"""
import re
import shutil
import uuid
from collections import Counter

import fitz

from . import render
from .config import Settings
from .store import Workdir, sha256_file, write_json

CAPTION_RE = re.compile(
    r"^\s*(fig(?:ure)?\.?|table|exhibit|chart|diagram)\s*"
    r"([0-9]+(?:\s*[.\-–]\s*[0-9]+)*[a-z]?|[ivx]+)\b",
    re.I,
)
CAPTION_MAX_CHARS = 400
LABEL_WORD = {"fig": "Figure", "figure": "Figure", "table": "Table", "exhibit": "Exhibit", "chart": "Chart", "diagram": "Diagram"}

Box = tuple[float, float, float, float]


# Rectangle helpers on plain tuples. fitz.Rect treats zero-width lines as empty, which breaks merging.
def union(a: Box, b: Box) -> Box:
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def area(r: Box) -> float:
    return max(0.0, r[2] - r[0]) * max(0.0, r[3] - r[1])


def overlap_area(a: Box, b: Box) -> float:
    return area((max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])))


def near(a: Box, b: Box, gap: float) -> bool:
    return a[0] - gap <= b[2] and b[0] - gap <= a[2] and a[1] - gap <= b[3] and b[1] - gap <= a[3]


def inside(inner: Box, outer: Box, slack: float = 2.0) -> bool:
    return (
        inner[0] >= outer[0] - slack and inner[1] >= outer[1] - slack
        and inner[2] <= outer[2] + slack and inner[3] <= outer[3] + slack
    )


class Cand:
    """A group of page elements that will become one figure."""

    def __init__(self, rect: Box, image: dict | None = None):
        self.rect = rect
        self.images = [image] if image else []

    def absorb(self, other: "Cand") -> None:
        self.rect = union(self.rect, other.rect)
        self.images += other.images


def merge(cands: list[Cand], gap: float) -> list[Cand]:
    changed = True
    while changed:
        changed = False
        out: list[Cand] = []
        for c in cands:
            for o in out:
                if near(o.rect, c.rect, gap):
                    o.absorb(c)
                    changed = True
                    break
            else:
                out.append(c)
        cands = out
    return cands


def text_blocks(page: fitz.Page) -> list[tuple[Box, str]]:
    out = []
    for b in page.get_text("blocks", sort=True):
        if b[6] == 0 and b[4].strip():
            out.append(((b[0], b[1], b[2], b[3]), b[4]))
    return out


def image_key(info: dict):
    digest = info.get("digest")
    return digest.hex() if digest else info.get("xref") or None


def find_repeated_images(doc: fitz.Document, settings: Settings) -> set:
    """Images that appear on most pages are logos or backgrounds, not figures."""
    per_page: Counter = Counter()
    for page in doc:
        keys = {image_key(i) for i in page.get_image_info(hashes=True, xrefs=True)}
        per_page.update(k for k in keys if k)
    need = max(settings.repeat_min_pages, settings.repeat_fraction * len(doc))
    return {k for k, n in per_page.items() if n >= need}


def clean_caption(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()[:CAPTION_MAX_CHARS]


def label_from(text: str) -> str | None:
    m = CAPTION_RE.match(text)
    if not m:
        return None
    word = LABEL_WORD.get(m.group(1).lower().rstrip("."), m.group(1).title())
    number = re.sub(r"\s*([.\-–])\s*", r"\1", m.group(2))
    return f"{word} {number}"


def find_caption(blocks: list[tuple[Box, str]], rect: Box, gap: float, taken: set) -> dict | None:
    """The caption block inside or next to rect: starts with Figure/Table and a number, and is short."""
    best = None
    for i, (b, text) in enumerate(blocks):
        if i in taken or len(text.strip()) > CAPTION_MAX_CHARS or not CAPTION_RE.match(text):
            continue
        if area(b) and overlap_area(b, rect) / area(b) >= 0.5:
            dist = 0.0
        else:
            below = b[1] - rect[3]
            above = rect[1] - b[3]
            if -2 <= below <= gap:
                dist = max(below, 0.0)
            elif -2 <= above <= gap:
                dist = max(above, 0.0) + 0.5  # prefer a caption under the figure when both are close
            else:
                continue
            shared = min(b[2], rect[2]) - max(b[0], rect[0])
            if shared < 0.3 * min(b[2] - b[0], rect[2] - rect[0]):
                continue
        if best is None or dist < best[0]:
            best = (dist, i, b, text)
    if best is None:
        return None
    _, i, b, text = best
    taken.add(i)
    return {"label": label_from(text), "caption": clean_caption(text), "rect": b}


def count_items(drawings: list[dict], rect: Box) -> int:
    n = 0
    for d in drawings:
        r = d["rect"]
        if inside((r.x0, r.y0, r.x1, r.y1), rect, slack=2.0):
            n += len(d["items"])
    return n


def detect_page(doc: fitz.Document, page: fitz.Page, repeated: set, settings: Settings, warnings: list[str]) -> list[dict]:
    pr = page.rect
    page_box: Box = (pr.x0, pr.y0, pr.x1, pr.y1)
    page_area = area(page_box)
    number = page.number + 1
    blocks = text_blocks(page)

    cands: list[Cand] = []
    for info in page.get_image_info(hashes=True, xrefs=True):
        r = tuple(info["bbox"])
        w, h = r[2] - r[0], r[3] - r[1]
        if not (w > 0 and h > 0) or w != w or h != h:
            continue
        if not settings.keep_repeated and image_key(info) in repeated:
            continue
        if area(r) > settings.max_page_fraction * page_area:
            warnings.append(f"Page {number}: one image covers the page (a scan or a background). Skipped, add it by hand if it is a figure.")
            continue
        if min(w, h) < settings.min_image_side:
            continue
        cands.append(Cand(r, info))

    drawings = page.get_drawings()
    for r in page.cluster_drawings(drawings=drawings):
        box = (r.x0, r.y0, r.x1, r.y1)
        if area(box) <= settings.max_page_fraction * page_area:
            cands.append(Cand(box))

    cands = merge(cands, settings.merge_gap)
    # Labels and numbers sit inside diagrams as text, so pull in text blocks that mostly lie inside.
    for c in cands:
        for b, _text in blocks:
            if area(b) and overlap_area(b, c.rect) / area(b) >= 0.5:
                c.rect = union(c.rect, b)
    cands = merge(cands, settings.merge_gap)

    found = []
    margin = settings.margin_fraction * (pr.y1 - pr.y0)
    for c in cands:
        w, h = c.rect[2] - c.rect[0], c.rect[3] - c.rect[1]
        items = count_items(drawings, c.rect)
        inner = [(b, t) for b, t in blocks if area(b) and overlap_area(b, c.rect) / area(b) >= 0.5]
        chars = sum(len(t) for _b, t in inner)
        if c.images:
            if min(w, h) < settings.min_image_side:
                continue
        else:
            if min(w, h) < settings.min_side or area(c.rect) < settings.min_area:
                continue
            if items < settings.min_vector_items:
                continue  # a shaded box or underline, not a diagram
            if chars > settings.text_heavy_chars and items < 3 * settings.min_vector_items:
                continue  # a boxed paragraph
            if c.rect[3] <= pr.y0 + margin or c.rect[1] >= pr.y1 - margin:
                continue  # header or footer rule
        kind = "vector" if not c.images else ("raster" if items == 0 and not inner else "mixed")
        found.append({"cand": c, "kind": kind, "items": items, "has_text": bool(inner)})

    found.sort(key=lambda f: (round(f["cand"].rect[1]), f["cand"].rect[0]))
    taken: set = set()
    figures = []
    for f in found:
        c: Cand = f["cand"]
        cap = find_caption(blocks, c.rect, settings.caption_gap, taken)
        original = None
        if f["kind"] == "raster" and len(c.images) == 1:
            original = render.embedded_original(doc, c.images[0], settings)
        fig = {
            "key": uuid.uuid4().hex[:12],
            "page": number,
            "kind": f["kind"],
            "label": cap["label"] if cap else None,
            "caption": cap["caption"] if cap else None,
            "status": "pending",
        }
        if original:
            fig.update(bbox=[round(v, 2) for v in c.rect], source="embedded", _original=original)
        else:
            rect = c.rect
            if cap:
                rect = union(rect, cap["rect"])  # the caption line is part of the crop
            padded = fitz.Rect(rect[0] - 2, rect[1] - 2, rect[2] + 2, rect[3] + 2) & pr
            fig.update(bbox=[round(v, 2) for v in tuple(padded)], source="render")
        figures.append(fig)
    return figures


def clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def save_figure_file(workdir: Workdir, fig: dict, page: fitz.Page, doc: fitz.Document, settings: Settings) -> None:
    """Write the image for a figure and fill in file, mime_type, width, height and sha256."""
    workdir.figures_dir.mkdir(parents=True, exist_ok=True)
    original = fig.pop("_original", None)
    if original:
        ext, data, w, h, digest = original["ext"], original["bytes"], original["width"], original["height"], original["sha256"]
    else:
        import hashlib

        data, w, h = render.render_clip(page, fig["bbox"], settings)
        ext, digest = "png", hashlib.sha256(data).hexdigest()
    path = workdir.figures_dir / f"{fig['key']}.{ext}"
    path.write_bytes(data)
    fig.update(file=f"figures/{path.name}", mime_type=render.MIME[ext], width=w, height=h, sha256=digest)


def extract_pdf(pdf_path, course: str, chapter: int, title: str | None, workdir: Workdir, settings: Settings, force: bool = False, log=print) -> dict:
    if workdir.exists():
        if not force:
            raise FileExistsError(f"{workdir.path} already has an import. Review it, or run extract again with --force (this discards your review).")
        shutil.rmtree(workdir.figures_dir, ignore_errors=True)
        shutil.rmtree(workdir.previews_dir, ignore_errors=True)
    workdir.path.mkdir(parents=True, exist_ok=True)

    doc = render.open_pdf(pdf_path)
    warnings: list[str] = []
    repeated = set() if settings.keep_repeated else find_repeated_images(doc, settings)

    pages_text, pages_meta, figures = [], [], []
    for page in doc:
        text = clean_text(page.get_text("text", sort=True))
        pages_text.append({"page": page.number + 1, "text": text})
        pages_meta.append({"page": page.number + 1, "width": round(page.rect.width, 2), "height": round(page.rect.height, 2), "text_chars": len(text)})
        for fig in detect_page(doc, page, repeated, settings, warnings):
            save_figure_file(workdir, fig, page, doc, settings)
            figures.append(fig)
        log(f"  page {page.number + 1}/{len(doc)}: {len(text)} characters, {sum(1 for f in figures if f['page'] == page.number + 1)} figure(s)")

    blank = [p["page"] for p in pages_meta if p["text_chars"] < 20]
    if blank:
        warnings.append(f"No text on page(s) {', '.join(map(str, blank))}. Scanned pages need OCR, which this tool does not do.")
    if repeated:
        warnings.append(f"Skipped {len(repeated)} image(s) repeated on most pages (logos or backgrounds). Use --keep-repeated to include them.")

    manifest = {
        "version": 1,
        "course": course,
        "chapter": chapter,
        "title": title,
        "pdf": {"path": str(pdf_path.resolve()), "filename": pdf_path.name, "sha256": sha256_file(pdf_path), "page_count": len(doc)},
        "settings": settings.to_dict(),
        "pages": pages_meta,
        "warnings": warnings,
        "figures": figures,
    }
    doc.close()
    write_json(workdir.pages_path, pages_text)
    workdir.save(manifest)
    return manifest
