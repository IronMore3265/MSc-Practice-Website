"""Builds a small PDF with known figures, so the detector can be tested without course material."""
import fitz


def picture(w=200, h=120, color=(220, 40, 40)) -> fitz.Pixmap:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, w, h), False)
    pix.clear_with(235)
    pix.set_rect(fitz.IRect(10, 10, w // 2, h // 2), color)
    pix.set_rect(fitz.IRect(w // 2, h // 2, w - 10, h - 10), (30, 30, 200))
    return pix


def paragraph(page, y, text="Procurement is the process of acquiring goods and services from outside suppliers. " * 3):
    page.insert_textbox(fitz.Rect(50, y, 545, y + 60), text, fontsize=10)


def flowchart(page, x, y):
    """Three boxes joined by arrows, with labels."""
    boxes = [fitz.Rect(x + i * 150, y, x + i * 150 + 110, y + 50) for i in range(3)]
    for i, r in enumerate(boxes):
        page.draw_rect(r, color=(0, 0, 0), width=1.2)
        page.insert_textbox(r + (4, 14, -4, 0), ["Plan", "Source", "Deliver"][i], fontsize=11)
        if i < 2:
            page.draw_line((r.x1, r.y0 + 25), (r.x1 + 40, r.y0 + 25), color=(0, 0, 0), width=1.2)
            page.draw_line((r.x1 + 32, r.y0 + 20), (r.x1 + 40, r.y0 + 25), color=(0, 0, 0), width=1.2)
            page.draw_line((r.x1 + 32, r.y0 + 30), (r.x1 + 40, r.y0 + 25), color=(0, 0, 0), width=1.2)
    return fitz.Rect(boxes[0].x0, y, boxes[2].x1, y + 50)


def table(page, x, y, rows=3, cols=3, cw=90, rh=24):
    for r in range(rows + 1):
        page.draw_line((x, y + r * rh), (x + cols * cw, y + r * rh), color=(0, 0, 0), width=0.8)
    for c in range(cols + 1):
        page.draw_line((x + c * cw, y), (x + c * cw, y + rows * rh), color=(0, 0, 0), width=0.8)
    for r in range(rows):
        for c in range(cols):
            page.insert_text((x + c * cw + 6, y + r * rh + 16), f"R{r}C{c}", fontsize=10)


def build(path) -> None:
    doc = fitz.open()
    logo = picture(40, 30, (0, 120, 0))
    for _ in range(4):
        page = doc.new_page(width=595, height=842)
        page.insert_image(fitz.Rect(500, 15, 540, 45), pixmap=logo)  # same logo on every page
        page.draw_line((50, 60), (545, 60), color=(0, 0, 0), width=0.5)  # header rule
        page.draw_line((50, 800), (545, 800), color=(0, 0, 0), width=0.5)  # footer rule
        page.insert_text((50, 78), "Chapter 1  Introduction", fontsize=14)

    p1, p2, p3, p4 = doc
    paragraph(p1, 100)
    p1.insert_image(fitz.Rect(100, 200, 300, 320), pixmap=picture())
    p1.insert_textbox(fitz.Rect(100, 326, 400, 350), "Figure 1.1: A plain picture", fontsize=10)
    paragraph(p1, 380)

    paragraph(p2, 100)
    flowchart(p2, 60, 200)
    p2.insert_textbox(fitz.Rect(60, 262, 400, 285), "Figure 1.2 Process flow", fontsize=10)
    paragraph(p2, 320)

    paragraph(p3, 100)
    box = fitz.Rect(60, 200, 535, 270)
    p3.draw_rect(box, color=(0.8, 0.8, 0.8), fill=(0.93, 0.93, 0.9))
    p3.insert_textbox(box + (8, 8, -8, -8), "Key point: a shaded callout holds a sentence, not a diagram. " * 2, fontsize=10)
    paragraph(p3, 300)

    p4.insert_textbox(fitz.Rect(60, 100, 400, 122), "Table 1.1 Supplier costs", fontsize=10)
    table(p4, 60, 130)
    img = fitz.Rect(100, 300, 300, 420)
    p4.insert_image(img, pixmap=picture(200, 120, (240, 140, 20)))
    p4.insert_text((120, 360), "Label on image", fontsize=11, color=(1, 1, 1))
    paragraph(p4, 450)
    doc.save(str(path))
    doc.close()


if __name__ == "__main__":
    import sys

    build(sys.argv[1])
