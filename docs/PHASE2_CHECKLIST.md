# Phase 2: what to verify by hand

The import tool and its review screen were tested on a generated sample PDF and against the live project (upload, re-upload, removal, cleanup). They have not seen your real course PDFs yet, so steps 3 to 5 matter most.

## Setup

1. `cd import-tool` and `pip install -r requirements.txt`.
2. Copy `import-tool/.env.example` to `import-tool/.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (same values as in `app/.env.local`).
3. The migration `20261030193000_source_pdf_page_text_figure.sql` is already applied to the Supabase project. If you ever rebuild the project, run all files in `supabase/migrations/` in order.

## Checklist

1. **Tests.** `python -m unittest discover -s tests -t .` from `import-tool`. 14 tests pass.
2. **RLS test.** Paste `supabase/tests/rls.sql` into the Supabase SQL editor and run it. The last result must read `ALL RLS TESTS PASSED`. It now also covers `source_pdf`, `page_text` and `figure`.
3. **Extract a real chapter.** Run `extract` on one chapter PDF with the exact course name from the Exams tab. Check the printed page and figure counts and any warnings.
4. **Review.** Run `review`. Go through every page that has figures. Check that diagrams are cut whole (labels and arrows included), the caption line is with its figure, tables are cut whole, and logos or shaded boxes are not listed. Fix with move, resize, merge, draw and reject. Look at the crop in the right panel: it must match the page.
5. **Missed figures.** Scroll the pages that you know have diagrams. Draw a box for any that were missed.
6. **Upload.** Run `upload --dry-run`, then `upload`. In the admin portal open Chapters. The chapter shows its PDF, page count, figure count and "Reviewed".
7. **Figures on the site.** Open the chapter. Each figure shows with its label, page and caption, matching the PDF 1:1. A "Rendered from the PDF" or "Original image bytes" note sits under each one.
8. **Pending is not uploaded.** Leave one figure pending, upload again: the chapter shows "1 to review" and that figure is not on the site. Approve it and upload again.
9. **Students and figures.** As an approved student (private window), `/admin/chapters` bounces to `/`. Open `/api/figures/<a figure id>`: the image loads. Signed out, the same URL goes to the login page.
10. **Re-import.** Re-run `upload` on the same chapter. Nothing duplicates (figure count unchanged).

## Known gaps and assumptions

- No OCR: scanned PDFs are flagged ("No text on page ...") but not read.
- No SVG export; vector figures are 300 DPI PNG.
- The course name given to `extract` must match the site exactly. If it does not, upload lists the real names.
- Page text is stored for the AI steps later and is readable by the admin only. Students see figures, not the text.
- Figures are only shown in the admin Chapters tab for now. Students see them from Phase 3 and 4 onward.
