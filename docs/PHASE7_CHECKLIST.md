# Phase 7: what to verify by hand

Phase 7 adds numerical problems (question type `problem`, for IPE 6112) and the mixed text and math answer editor. A problem is practised in the CQ section, next to CQs. The student types or photographs the working, the editor shows it as numbered rows (sentences with small math boxes, and centred equation rows), and the AI marks method steps, the final answer and units. Feedback shows the student's own rows with the first wrong step marked, then a worked solution.

The database logic is covered by an automated test. The editor was driven in the browser pane on a desktop and a phone sized screen (typing, `$` math boxes, toolbar keys, rows, undo). The whole flow with a real student, a real set and real Gemini marking was NOT run end to end (see the end), so the steps below are the real check.

## Setup

1. The migration `20261031030000_problem_questions.sql` is already applied to the Supabase project. If you ever rebuild the project, run all files in `supabase/migrations/` in order.
2. New package: `mathlive` (MIT). Run `npm install` in `app`. Its math fonts are copied into `app/public/mathlive-fonts` and committed, so nothing is loaded from a CDN.
3. No new environment variables.
4. IPE 6112 needs chapters with imported PDFs and approved `problem` questions in a set. In the admin, Questions, you can now pick "Problem" when you make a question, and "Problem" in the AI generator. Chapters are linked to the IPE 6112 exams by the admin (the seed leaves them empty).

## Automated checks

- `npm test` in `app`: 56 tests. New ones cover the dollar sign format (parse and write rows, inline math, escaped dollars), the problem grade checks (row numbers, pages, figures, score range, first wrong row), the problem prompt, and the reading prompt.
- `supabase/tests/phase7.sql`: paste it into the Supabase SQL editor and run it. The last result must read `ALL PHASE 7 TESTS PASSED`. Everything rolls back.
- `supabase/tests/phase5.sql` and `phase6.sql`: two functions they use were replaced (`start_cq_session`, `get_cq_session`). I re-ran both on the live project after this migration and both end with their ALL PASSED line.

## Checklist

1. **Admin: new problem.** Questions, New question, type Problem. The last box is "Marking scheme" (one step per line, then "Final answer: ... with its unit"). Math goes between dollar signs. Save and approve.
2. **Admin: generate problems.** In the generator pick Problem. Drafts arrive with a marking scheme. Read each one before approving, as with CQs.
3. **Start.** A set with problems (and CQs) starts from the home screen under the CQ section. A problem shows "Problem" in the top label.
4. **Math editor, typing.** The answer box is a list of numbered rows with a toolbar. Type a sentence, type `$` to open a small math box in the line, type the math, press `$` again or the right arrow to leave it. Enter starts a new text row. "Equation row" adds a centred equation. "Inline math" does what `$` does.
5. **Toolbar.** Fraction, power, subscript, roots, sum, integral, brackets, overline, hat, Greek letters, Φ, π, infinity, plus or minus, comparison signs. "More" opens probability and statistics, units and arrows. Keys act on the math box you are in, or open one in the current row.
6. **Rows.** Eq/Tx switches a row between sentence and equation. The arrows move a row, the cross deletes it, Undo and Redo step back and forward. Backspace in an empty row deletes it.
7. **Phone.** One column, the toolbar rows scroll sideways, and the MathLive on-screen math keyboard opens when you tap a math box. Plain text uses the normal phone keyboard. I could not test the on-screen math keyboard or a real phone.
8. **Photo answers.** Pick Photo, take photos of the working, press Read. The reading comes back as rows (sentences as text, equations as math). Your photos stay above the editor while you fix. Parts the reading was unsure about are orange chips and the row is underlined in orange. Tapping a chip jumps to that part. Edit, then "Looks right, submit for marking".
9. **Marking.** The progress panel for a problem says "Checking calculations" instead of "Checking grammar". Feedback shows: marks, "Your working" (your rows, wrong rows with an orange bar, "First wrong step"), "Final answer" (correct value, yours, units), points you got right, missing points with pages, corrections, and the worked solution in text and math.
10. **Fairness.** Mark a few answers where you know the right result: a correct one (full marks), one with a wrong formula, one with a right method and an arithmetic slip (some method marks), one correct with a different rounding (should be accepted), one with missing units (loses at most one mark).
11. **Marking scheme stays private.** The marking scheme (the `answer_notes`) is never in the page of a student.
12. **Results page.** A finished session lists "Problem" or "CQ" for each question, and the problem feedback is shown the same way.
13. **Daily cap.** A problem counts as one grading, like a CQ. A photo problem (reading and marking together) is one.

## Known gaps and assumptions

- Only the figure attached to the question is sent to the AI as an image. Distribution tables stored as figures are not attached to marking, only the chapter text (which may hold the table as text). If a table matters, put its values in the marking scheme, or tell me and I will attach table figures for problems.
- The reading marks unsure parts by row (orange underline and chips), not by underlining the exact words inside a sentence.
- The text-to-equation switch writes the sentence as `\text{...}` pieces in the equation. Undo brings the sentence back.
- The on-screen math keyboard comes from MathLive and is only seen on touch devices. The math boxes are a custom element inside an editable line, so very unusual phone keyboards (voice typing) are handled by a fallback that reads `$` from the text.
- Marks are whole numbers. The AI marking of numerical problems depends on the model working the problem out correctly, so spot check it as in step 10.
- One real Gemini run of the marking prompt (synthetic notes, a deliberate lower tail mistake): the backup model took 9 seconds and gave a correct grade, flagged row 3 as the first wrong step, found the right final answer 0.0228 and a clean worked solution. The primary model was out of quota or hung (120 s) on that day, as in earlier phases. The reading prompt for problems was not run against real handwriting.
