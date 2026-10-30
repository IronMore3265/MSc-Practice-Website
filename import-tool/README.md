# Import tool (Phase 2)

Runs on your laptop, once per chapter PDF. It reads the text of every page, finds the figures, lets you check them on a review screen, then uploads the text and the approved figures to Supabase. It is not deployed. The PDFs stay on your laptop.

One PDF is one chapter. Figures are 1:1 copies: a plain picture is saved with its original bytes from the PDF, and a diagram or table drawn from shapes is rendered from the PDF at 300 DPI. Nothing is redrawn.

## Setup (once)

```bash
cd import-tool
pip install -r requirements.txt
```

Copy `.env.example` to `.env` in this folder and fill in `SUPABASE_URL` (same as `NEXT_PUBLIC_SUPABASE_URL` in `app/.env.local`) and `SUPABASE_SERVICE_ROLE_KEY`. `.env` is git-ignored.

## Per chapter

1. Extract. The course name must match the site exactly (see the Exams tab in the admin portal).

```bash
python -m pdfimport extract "C:/path/to/chapter4.pdf" --course "Sourcing & Procurement Management in Supply Chain" --chapter 4 --title "Supplier selection"
```

This writes `import-tool/data/<course>/ch-04/` (git-ignored): `pages.json`, `manifest.json` and one image per figure candidate. It prints warnings, for example pages with no text.

2. Review.

```bash
python -m pdfimport review --course "Sourcing & Procurement Management in Supply Chain" --chapter 4
```

A page opens in your browser (127.0.0.1 only). Each page is shown with its detected figures. Edits save as you go.

| Action | How |
|---|---|
| Approve, reject | Select a box, press A or R, or use the buttons |
| Next unreviewed figure | N, or "Next pending" |
| Change page | Left and right arrows, or the page list |
| Move or resize a box | Drag it, or drag a handle. The figure is re-cut from the PDF |
| Add a missed figure | Drag on an empty part of the page. It is added as approved |
| Merge pieces of one figure | Shift-click the boxes, then "Merge" |
| Fix label or caption | Edit the fields on the right |
| Approve everything left | "Approve all pending" |

The panel on the right shows the exact crop that will be uploaded, with its size and whether it is the original image or a render.

3. Upload.

```bash
python -m pdfimport upload --course "Sourcing & Procurement Management in Supply Chain" --chapter 4
```

Only approved figures are uploaded. Pending ones are skipped and counted, and the chapter shows "to review" in the admin Chapters tab until none are left. Run `--dry-run` first to see the counts. Running upload again is safe: rows are matched by chapter, page and figure key, and figures you later reject are removed from the site.

## What the detector does

- Text: PyMuPDF text per page, in reading order.
- Raster images: found with their position on the page. A region that is one plain image with nothing on top is copied byte for byte. Images with transparency, CMYK images, rotated or cropped placements, and images with labels drawn over them are rendered instead.
- Vector diagrams and tables drawn with lines: shapes are clustered, nearby pieces are merged, text inside the region (labels) is pulled in, and the region is rendered at 300 DPI.
- The caption line ("Figure 4.2", "Table 3.1" and similar) next to a figure is stored as its label and caption, and included in the crop of rendered figures.
- Skipped on purpose: images repeated on most pages (logos), full-page images, header and footer rules, shaded text boxes, bullets and underlines. Use `--keep-repeated` to keep repeated images.

Detection is a first guess. The review screen is where figures become correct.

## Tests

```bash
python -m unittest discover -s tests -t .
```

The tests build a small PDF on the fly. No course material is needed.

## Known gaps

- No OCR. A scanned page has no text and is flagged, so the PDFs must be text PDFs.
- Pages are shown upright whatever their rotation flag says.
- No SVG export for pure vector figures. The site uses the 300 DPI PNG.
- Tuning knobs live in `pdfimport/config.py` (minimum size, merge distance, text-heavy limit) if a particular book needs them.
