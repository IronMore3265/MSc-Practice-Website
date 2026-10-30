# Phase 4: what to verify by hand

Phase 4 adds MCQ practice: the student home screen (course, exam, section, chapters, set), the practice screen with a countdown and the dashed explanation box, the results screen with weak chapters, retry of missed questions, and a "Report question" button. MCQ answering never calls the AI.

The database logic (hidden answer key, timers, privacy between students, retry, reports) is covered by automated tests. I also clicked through the whole flow in the browser on a phone-sized screen with a throwaway student and course, then deleted them (nothing of it is left in your project). The steps below are the real-data check.

## Setup

1. The migration `20261030233000_mcq_practice_sessions.sql` is already applied to the Supabase project. If you ever rebuild the project, run all files in `supabase/migrations/` in order.
2. No new environment variables, no new packages.
3. MCQ practice needs approved MCQs in the question bank and a set for the exam (Phase 3). If an exam has no set yet, the home screen has "+ New random set".

## Automated checks

- `npm test` in `app`: 17 tests (the 5 new ones cover the clock, duration, percent and id checks).
- `supabase/tests/phase4.sql`: paste it into the Supabase SQL editor and run it. The last result must read `ALL PHASE 4 TESTS PASSED`. It covers: only approved MCQs enter a session, the answer key stays hidden until a question is answered or the session ends, answers are final, seconds spent are measured by the server, the countdown closes a session and refuses late answers (3 seconds of grace), retry of missed questions, other students and even the admin cannot read a student's sessions, reports. Everything rolls back.
- `supabase/tests/rls.sql` and `supabase/tests/phase3.sql` still end with their "ALL ... PASSED" lines.

## Checklist

1. **Home screen.** Sign in as a student. You see course pills, exam cards (chapters and weight), a section row for exams with both MCQ and CQ, chapter pills, set pills and "Start practice". The bottom line shows the exam's MCQ timer.
2. **Narrow the chapters.** With "All" selected, tap "Ch 2": only chapter 2 stays selected and the line under the sets shows how many MCQs the set has for it. Tap "All" to go back.
3. **Sets.** "+ New random set" makes the next set and selects it. After you finish a set, its pill shows your last score, for example "Set 1 · 80%".
4. **Start.** The practice screen shows "EXAM / MCQ · Q 1 / N", the black timer pill with orange digits, progress segments, the orange question card and four option cards.
5. **Wrong pick.** Your pick turns black, the correct option turns orange, the others fade, and the dashed box shows "Why C · Ch 1 notes, p. 12" with the explanation. Open the PDF and check that the page number and the explanation are right.
6. **Right pick.** The option turns orange and the box says "Correct" with the explanation.
7. **An answer is final.** You cannot change it. Reloading the page keeps your answers and the time left.
8. **Move around.** "Next question" is enabled after you answer. The segments let you jump to another question. On a laptop, keys A to D pick an option and Enter or N goes on.
9. **Figure.** A question that has a figure shows the original image with "Refer to Figure N", the file and the page. It must be the same image as in the PDF.
10. **Phone.** On your phone: one column, no sideways scrolling, tap targets are big, the explanation scrolls into view after you pick.
11. **Finish early.** On the last question press "Finish" with one question left open: it asks first, then the result counts it as missed. "End session" in the footer does the same from any question.
12. **Results.** Score out of total marks, right count, time, accuracy bar per chapter, "Missed, review these" (open one: your answer, the correct one, the explanation and page), and "Earlier attempts on this set" with "Up N points" after a second try of the same set.
13. **Retry.** "Retry missed" starts a session with only the missed questions (not compared with full-set scores). "Retry set" runs the whole set again. "New session" goes home.
14. **Countdown.** In the admin Exams tab set an exam's MCQ timer to 1 minute, start it and wait. At 00:00 the screen says time is up and the result appears, with "Time ran out", unanswered questions counted as missed. Put the timer back afterwards. (The last minute turns the pill orange.)
15. **Leave and come back.** Close the tab in the middle of a session. The home screen shows "You left a ... session open" with Continue, and the clock kept running.
16. **Report a question.** Press "Report question", write a note, send. As admin, the Questions tab shows a "Reported 1" chip with the note and "Clear reports".
17. **Privacy.** A second student (private window) opening the first student's `/practice/<id>` link gets "not found". The admin cannot open it either.
18. **CQ only exams.** An exam that is only descriptive shows a note that CQ practice is not available yet, and no Start button.

## Known gaps and assumptions

- Only the MCQ section can be started. CQ practice, the stopwatch and grading come in Phase 5, so "MCQ + CQ" and "CQ only" are shown but switched off.
- The MCQ countdown is the exam's full MCQ time even if you narrow the chapters or retry only the missed questions. Say if you want it scaled to the number of questions.
- "Save report PDF" and the full History screen come in Phase 8. The results screen is the only place scores show for now (plus the score on the set pill).
- Math is not rendered in MCQs yet (MathLive arrives in Phase 7). Question text is plain text.
- Deleting a question in the admin also removes it from students' past results (their score totals stay).
- The Supabase security advisor lists the new practice functions as "callable by signed-in users". That is intended: each one checks that the caller is an approved member and only touches their own session, like `create_invite`. It also lists "Leaked password protection disabled" for Auth. That was already the case, and you can switch it on in Auth settings if your plan allows.
