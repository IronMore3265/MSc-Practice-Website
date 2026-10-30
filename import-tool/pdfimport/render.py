"""Opening PDFs, rendering a region to PNG, and pulling an embedded image out byte for byte."""
import hashlib

import fitz

from .config import Settings

MIME = {"png": "image/png", "jpeg": "image/jpeg", "jpg": "image/jpeg"}


def open_pdf(path) -> fitz.Document:
    """Open a PDF and show every page upright, so all coordinates share one frame. The file is not changed."""
    doc = fitz.open(str(path))
    for page in doc:
        if page.rotation:
            page.set_rotation(0)
    return doc


def clamp_bbox(page: fitz.Page, bbox) -> fitz.Rect:
    return fitz.Rect(bbox) & page.rect


def render_clip(page: fitz.Page, bbox, settings: Settings) -> tuple[bytes, int, int]:
    """Render a page region as PNG at the configured DPI (lowered if the region would be huge)."""
    rect = clamp_bbox(page, bbox)
    zoom = settings.dpi / 72
    longest = max(rect.width, rect.height) * zoom
    if longest > settings.max_render_px:
        zoom *= settings.max_render_px / longest
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=rect, alpha=False)
    return pix.tobytes("png"), pix.width, pix.height


def embedded_original(doc: fitz.Document, info: dict, settings: Settings) -> dict | None:
    """The image exactly as stored in the PDF, or None when a faithful copy needs a render instead.

    None for: transparency masks, CMYK or other formats browsers cannot show, rotated or flipped placement,
    a placed shape that does not match the pixel shape (cropped or stretched), and very large files.
    """
    xref = info.get("xref") or 0
    if not xref:
        return None
    a, b, c, d, _e, _f = info.get("transform", (1, 0, 0, 1, 0, 0))
    if abs(b) > 1e-3 or abs(c) > 1e-3 or a <= 0 or d <= 0:
        return None
    try:
        img = doc.extract_image(xref)
    except Exception:
        return None
    if not img or img.get("smask"):
        return None
    ext = img["ext"]
    if ext not in ("png", "jpeg") or img.get("colorspace") not in (1, 3):
        return None
    data = img["image"]
    if len(data) > settings.max_embedded_bytes:
        return None
    rect = fitz.Rect(info["bbox"])
    if rect.is_empty or img["height"] == 0 or rect.height == 0:
        return None
    if abs((rect.width / rect.height) / (img["width"] / img["height"]) - 1) > 0.03:
        return None
    return {
        "bytes": data,
        "ext": "jpg" if ext == "jpeg" else ext,
        "width": img["width"],
        "height": img["height"],
        "sha256": hashlib.sha256(data).hexdigest(),
    }
