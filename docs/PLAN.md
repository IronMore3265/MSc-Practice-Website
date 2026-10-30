# Exam Practice Website: Project Plan (v0.7)

Status: brainstorming is finished, the plan is build-ready. The app will be built with Claude Code and kept on GitHub (section 15). Decisions are in section 0. Items marked **[OPEN]** are listed in section 13.

## 0. Decisions locked

- Source material: text PDFs, one PDF per chapter (so a chapter is a PDF). The notes contain diagrams and figures.
- Figures: the site shows a true 1:1 copy of each diagram, by extracting the original image from the PDF, never by redrawing it with AI (section 6).
- Language: English only.
- Courses: 4 courses. Two are known so far: Sourcing & Procurement, and IPE 6112 Probabilistic Methods in Engineering Design (section 2).
- Exams are defined per course, because each course has a different exam structure. The admin edits them.
- Sets: each exam has multiple question sets. You can redo a set or generate a new random one.
- Midterm set size: 10 MCQs and 4 CQs (CQs worth 5 marks each).
- Question source: both. Your own questions plus AI generated MCQs and CQs from the chapters you pick.
- Section: when an exam has both MCQ and CQ you choose MCQ only, CQ only, or both. Scope: the exam's own chapters by default, narrowed to fewer chapters if you want.
- Timers: MCQ has a 10 minute countdown by default, CQ has a stopwatch that counts up.
- Wrong MCQ click: your pick fills black, the correct option fills orange, then a dashed explanation box shows the reason and source page.
- CQ scoring: marks out of N plus covered points, missing points, corrections, wording, grammar and an improved answer.
- CQ grading style: a little flexible, but it rewards and teaches the wording used in the source notes.
- Numerical problems (IPE 6112): answers mix sentences and math. After transcription, the student gets a mixed text and math editor (type words and equations in the same line, plus separate equation lines) with a math toolbar (section 7b).
- Accounts: student login portal plus one admin (master) portal. Any member can invite a friend with a code, and the admin must approve every new account (section 5a).
- Platform: Next.js on Vercel and a NEW Supabase project (Auth, Postgres, Storage, row level security). Free plan (section 5).
- Rate limits: request router with model fallback across both Google projects from the start, plus a paced job queue (section 5b).
- Waiting experience: step-by-step progress (slow at first, fast finish) plus a small game that works on laptop and phone (section 5c).
- Printable report: optional "Save report PDF" button, never forced.
- Devices: laptop and phone.
- Look: RoboNuggets style as in exam-ui-mockup-v5.png.
- Build workflow: Claude Code for building, GitHub for the codebase, Vercel for deploys (section 15).

## 1. Goal

A web app where you and your friends practice for university exams. Source PDFs are imported once. The app runs MCQ, descriptive (CQ) and numerical practice sets, checks answers against the source notes, shows the original figures, and gives feedback on content gaps, wording, grammar and calculations.

## 2. Courses, exams and sets

### 2.1 Known courses

**Sourcing & Procurement** (from your screenshot):

| Exam | Weight | Format | Chapters |
|---|---|---|---|
| CT-1 | 10% | MCQ | 1, 2 |
| CT-2 | 10% | MCQ | 4, 5 |
| Midterm | 30% | 10% MCQ + 20% descriptive | 1, 2, 3 |
| Final | 30% | Fully descriptive | 4, 5, 6, 7 (midterm chapters not included) |
| Term paper | 10% | Details to be announced | To be announced |
| Case study | 10% | Details to be announced | To be announced |

Term paper and case study are not practice exams for now.

**IPE 6112 Probabilistic Methods in Engineering Design** (from the course info sheet):

- Grading: homework 10%, two mid-term exams 40%, term project 20%, final exam 30%.
- Exams are expected to include numerical problems (you confirmed). Which topics go in Mid-term 1, Mid-term 2 and the final is not stated yet. The admin can enter it later. **[OPEN, low priority]**
- Nine topics: basic probability, random variables and distributions, data analysis, functions of random variables, response surface methods, Monte Carlo simulation, component reliability, system reliability, reliability-based design.

### 2.2 Exams are per course

The exam list is not fixed to CT, mid term and final. Each course has its own list. For each exam the admin sets: name, weight, which chapters, how many marks are MCQ and how many are CQ or problems, MCQ timer, and whether it is MCQ only, CQ only, or both. Sourcing & Procurement has CT-1, CT-2, Midterm and Final. IPE 6112 will have Mid-term 1, Mid-term 2 and Final.

### 2.3 Sets

- Each exam has multiple sets (Set 1, Set 2, Set 3 and so on).
- A set is a saved list of questions. By default it is built automatically from the question bank, spread across the exam's chapters, so the mix of chapters matches the real exam.
- "New random set" builds another one. Sets can also be hand-picked by the admin.
- Redoing a set shows your earlier scores for it, so you can see improvement.
- Default set sizes (editable per exam in the admin portal):
  - Midterm: 10 MCQs (1 mark each) and 4 CQs (5 marks each). This is more than the real paper so you get extra practice, as you asked.
  - CT-1 and CT-2: 10 MCQs, 1 mark each (assumption).
  - Final: 6 CQs, 5 marks each (assumption, since the real layout is not known yet).

### 2.4 Session and timers

A session is: course, exam, section, chapters, and a set.

- MCQ: 10 minute countdown for the whole MCQ part by default (an exam can override it). At zero the part is submitted and unanswered questions count as missed.
- CQ and problems: stopwatch that counts up. Time per question and total time are saved.
- Both sections: the MCQ countdown runs first, then the CQ stopwatch starts.

## 3. Core features (MVP)

1. Login, invites, approval and roles (section 5a).
2. Admin portal: courses, exams, chapters, sets, question bank review, students and invites, AI router status.
3. PDF import (run once per PDF on your laptop): text per page, 1:1 figure extraction, upload to the database and storage. One PDF becomes one chapter.
4. Question bank: your own questions, plus AI generated ones marked with an "AI" chip. The admin can edit or delete any question.
5. MCQ practice: question card, four option cards, countdown, orange for correct, black for wrong, correct answer revealed, dashed explanation box with source page and figure.
6. CQ practice: question card with its figure, answer box, type or upload photos, transcription fix step, stopwatch, staged progress while grading, feedback screen.
7. Numerical problems: working shown line by line in a math editor with a toolbar (section 7b).
8. History per student: every attempt, score, time and feedback, accuracy by chapter.
9. Optional report: "Save report PDF" (section 9).

## 4. Later features

- Full mock mode that copies the real paper (all sections, total time).
- Spaced repetition for missed MCQs.
- Bulk question import.
- Admin upload of new PDFs from the browser.
- Password reset by email (needs an email service).

## 5. Architecture and platform

```
Phone / laptop browser
   |  HTTPS
Vercel: Next.js app (UI + server routes)
   |-- Supabase Auth: email and password login
   |-- Supabase Postgres: all app data, protected by row level security (RLS)
   |-- Supabase Storage (private buckets): figure images, answer photos
   |-- Gemini API via the request router (section 5b)

Your laptop, once per PDF: Python import tool (PyMuPDF)
   text per page, figures --> Supabase Postgres and Storage
```

Stack: Next.js (App Router, TypeScript), a new Supabase project, the official Gemini SDK, MathLive for math input and display.

### Supabase setup (new project)

- Create one NEW project for this app. Pick the region closest to Bangladesh (Singapore) and save the database password in a password manager.
- Free plan limits (checked October 2026): 500 MB database, 1 GB file storage, 50,000 monthly active users, and a project pauses after one week without activity. A paused project can be restored from the dashboard, but the site is down until you do.
- Keep it awake: a daily Vercel cron job (Hobby allows one run a day) makes one small database query. Friends using the site also count as activity.
- Backups: the free plan has no automatic restore points you can rely on, so the admin portal gets an "Export data" button (questions, sets, students) and the repo keeps all migrations as SQL files.

### Why this works with the plan

- Row level security gives a second safety layer: even if app code has a bug, a student cannot read another student's attempts.
- Supabase Auth handles passwords, sessions and secure cookies.
- Storage buckets are private. Figures and photos are served with short-lived signed links.

### Caveats to plan for

- Storage is only 1 GB: compress answer photos on the phone before upload (about 300 KB each), delete each answer photo after grading (keep only the transcription text), and show storage usage in the admin portal.
- Database is 500 MB: page text, questions and feedback JSON are small, so this is plenty for 4 courses. Do not store raw PDFs in the database.
- Public sign-up must be switched OFF in Supabase. Accounts are created only by a server route that checks the invite code first (section 5a). The service role key lives only in Vercel environment variables, never in browser code.
- RLS policies must be written and tested for every table (students see only their own rows, question content is readable by active students, admin tables are admin only). Claude Code writes them as migrations and you test with two student accounts.
- Vercel function time: up to about 5 minutes on Hobby, so short AI calls are fine. Heavy PDF work runs offline on your laptop.
- Your two older Supabase projects are not touched by this app.

Key rules:

- Gemini keys, database URL and auth secret live only in Vercel environment variables (and a local `.env.local` that is never committed).
- Model names, key order and pacing are configuration, not code.
- Free Gemini tier requests may be used by Google to improve products. Tell your friends not to upload private material.
- For each exam set, the selected chapters' text (each chapter is one PDF) is sent to Gemini as context. No vector search in v1. Revisit if chapters turn out too large.
- Course notes may be copyrighted. The site is private (login plus approval), and the original PDFs stay on your laptop. Only extracted text and figures are stored online.

## 5a. Accounts, invites and admin portal

Roles:

- Student: practice, history, own reports, invite friends.
- Admin (you): everything students can do, plus the admin portal at `/admin`.

Login:

- Supabase Auth with email and password. Public sign-up is off. No email service in v1. Password resets are done by the admin in the portal (Supabase Auth can send reset emails later).
- Sessions use secure cookies.

Invites and approval:

- Any active member can create invite codes. Default: up to 3 unused codes at a time per member (editable by the admin). The admin has no limit.
- Each code works once and expires after 7 days.
- Sign-up goes through a server route that checks the code, then creates the Supabase user. The new account starts as `pending` and cannot practice until the admin approves it.
- The admin sees who invited whom. If an account is rejected or misbehaves, the admin can lower or remove that inviter's invite limit.

Privacy and limits:

- Students' answers are private to them. The admin sees usage counts (jobs per student per day) and can open an attempt only if the student shares it.
- Per-student daily cap on CQ gradings and photo transcriptions: default 10 per day, editable. MCQ practice is not capped because it makes no AI calls.

Admin portal screens:

1. Exams: course list, exam list per course (weight, chapters, format), set settings (MCQs per set, CQs per set, marks per CQ, MCQ timer).
2. Courses and chapters: names, chapter to PDF mapping, figure review status.
3. Question bank: filter by course and chapter, approve or delete AI questions, add your own.
4. Sets: view, create, hand-pick.
5. Students and invites: pending approvals with "invited by", active, disable, reset password, daily cap, invite limits.
6. AI router and usage: slot status, queue, pace, failures, storage usage, data export.

## 5b. Rate limits: request router and job queue

Facts checked in October 2026:

- Gemini 3.8 Flash and Gemini 3.6 Flash are both on the free tier. Google no longer publishes exact per-model numbers in its docs. Your real limits are shown per project in Google AI Studio.
- Limits are per project, not per API key.
- Vercel Hobby cron jobs can run at most once a day.

What never uses the AI: MCQ answer checking uses stored correct options and stored explanations. Only transcription, CQ grading and question generation use the AI. MCQs and their explanations are generated ahead of time and saved in the question bank.

### Method 1: request router (fallback chain)

Every AI job tries these slots in order:

1. Key A (Google project A), primary model (`gemini-3.8-flash`)
2. Key A, backup model (`gemini-3.6-flash`)
3. Key B (Google project B), primary model
4. Key B, backup model

- Each (key, model) pair is a slot with its own pace and cooldown, stored in the database.
- On a 429 error the slot rests (use the retry delay from the API if given, otherwise 60 seconds) and the router moves to the next slot.
- If every slot is resting, the job stays in the queue.
- You chose to enable both Google projects from the start. Keep a setting that switches the Key B slots off. I could not confirm that Google's terms allow extra projects just to raise free-tier limits, and with friends using the site a flagged project would affect everyone. Read the Gemini API terms once before launch.

### Method 2: paced job queue

- The student submits an answer. The server saves it and the photos, creates a job row with status queued, and shows progress (section 5c).
- Jobs run at a safe pace per slot, for example one request every 12 seconds for a 5 RPM slot. With several slots the router uses whichever is ready, so total throughput is the sum.
- BullMQ and a `setInterval` loop need an always-on server (BullMQ also needs Redis). Vercel runs short serverless functions, so neither fits. Instead the queue is a `job` table plus a "tick":
  - The waiting page polls `/api/jobs/{id}` every few seconds.
  - Each poll also runs a tick: if a slot is ready (its `next_allowed_at` has passed), the tick atomically claims the oldest job (`SELECT ... FOR UPDATE SKIP LOCKED`) and processes it in that call.
  - A lock on the slot row stops two ticks from using the same slot at once.
- If nobody is polling, jobs wait. They run when the page is reopened, and an optional daily cron can catch leftovers.
- Priority: jobs a student is waiting on (transcribe, grade) first, background jobs (question generation) last.
- A job that fails 3 times is marked failed with a Retry button. An uploaded answer is never dropped.

## 5c. Progress experience and waiting game

Goal: waiting feels like completing steps and earning small rewards, not watching one flat bar.

Steps shown for a CQ (typed answers skip step 2; numerical problems add "Checking calculations"):

1. File received
2. Handwriting read
3. Matching with your notes
4. Checking grammar
5. Scoring and feedback

Behavior:

- Each step finishes with a check mark and a small orange pixel pop, so every step feels like a win.
- The bar moves slowly at first and eases toward about 85 to 90 percent. When the real result arrives, the bar fills to 100 percent in under a second and a "Feedback ready" button appears.
- The bar is labelled "Estimated". Queue position and the moment the job starts are real. The middle steps are timed to match what the single AI call does, so they are an estimate, not a measurement.
- If the job is still queued, step 1 stays active with "Position in queue #N".
- The student can leave the page. The result is saved in History.

Game:

- Runs fully in the browser, so it costs no API calls. Works with arrow keys or WASD on laptop and swipe on phone.
- First game: Snake in the pixel style. More games (for example term match using the chapter's key terms) can be added later behind "Pick another game".
- Best score is kept in the browser. The game is never cut off mid-play when the result arrives. A "Feedback ready" button appears instead.

## 6. Figures: true 1:1 copies

The only way to get a true 1:1 copy is to take the original pixels or original vector drawing from the PDF. Redrawing with AI would change details.

Import tool steps (one PDF per chapter):

1. Raster images embedded in the PDF: extract the original image bytes (no re-encoding where possible).
2. Vector diagrams (flowcharts, charts, boxes and arrows drawn as shapes): detect clusters of drawing shapes on the page, include the nearby caption line (for example "Figure 4.2"), then render that region at high resolution (about 300 DPI) as PNG. Keep an SVG export if the region is purely vector.
3. Tables drawn as images or shapes: same as step 2.
4. Each figure is saved with: course, chapter, page, bounding box, label, caption, image file.
5. A review screen in the import tool shows each detected figure next to its page so you can fix a wrong crop, merge pieces, or add a missed figure by drawing a box.

Where figures appear:

- On a question card when the question refers to a figure.
- In MCQ explanations and CQ feedback ("see Figure 4.2, page 58").
- Sent to Gemini as an image when a question depends on a figure.
- Never altered, recolored or redrawn. A caption shows the label and page so it is clear it is the original.

## 7. CQ grading flow

1. The student submits the answer (typed, or photos then confirmed transcription). The stopwatch value is saved.
2. The job is queued and processed by the router (section 5b).
3. Backend sends to Gemini: question, marks, the answer, the chapter text, and the figure if any, plus the grading instructions.
4. Gemini returns structured JSON:

```json
{
  "score": 3,
  "out_of": 5,
  "covered_points": ["..."],
  "missing_points": [{"point": "...", "source_page": 61, "figure": "Figure 4.2"}],
  "wording": [{"yours": "...", "source_wording": "...", "page": 58}],
  "incorrect_claims": [{"claim": "...", "correction": "...", "source_page": 63}],
  "extra_not_in_source": ["..."],
  "grammar": [{"original": "...", "fixed": "...", "note": "..."}],
  "improved_answer": "..."
}
```

5. The UI shows each part as its own card.

Grading rules (a little flexible, source wording first):

- Match points by meaning, so a correct idea in different words still earns marks.
- Prefer the notes' terms and phrasing. When the student's wording differs, show the source wording and page. Using the source wording scores slightly better than a loose paraphrase.
- Correct extra points not in the notes are not penalized, are flagged "not in source", and add no marks beyond the total.
- Wrong claims get a correction with a page reference.
- Grammar fixes are separate from content feedback.
- The improved answer uses the source wording.
- Never invent page numbers or figure labels. If unsure, say so.
- Return valid JSON only.

## 7b. Numerical problems and the mixed text and math editor (IPE 6112)

Question kind `problem` is added next to `mcq` and `cq`. Real answers mix sentences and equations, for example "Since the load is normal, z = (14 - 10) / 2 = 2, so P(X > 14) = 1 - Φ(2)". So the editor handles both together, not math only.

How an answer is stored: plain text with math written as LaTeX between dollar signs. Inline math: `Since $z=\frac{14-10}{2}=2$ we use the table.` Separate equation line: `$$P(X>14)=1-\Phi(2)$$`. The same format is used for typing, for the transcription output and for grading.

Editor (mockup screen 11):

- The answer is a list of rows. Each row is one of two kinds, and a row can switch kind:
  - Text row: a normal sentence. Math can be inserted inside the sentence at the cursor, shown as a small math box in the line.
  - Equation row: a full-width centred equation (display math).
- Typing `$` starts an inline math box and `$` again leaves it. The toolbar button "Insert math" does the same. Arrow keys move in and out of a math box.
- Toolbar, left group "Insert": Text row, Equation row, Inline math.
- Toolbar, math keys (work inside any math box): fraction, power, subscript, square root, nth root, sum, integral, brackets, overline and hat, Greek letters (μ, σ, ρ, β, λ and more), Φ, π, infinity, plus or minus, ≤, ≥, ≠, ≈.
- "More" panel: probability and statistics symbols (P, E, Var, Cov and similar), units, arrows.
- Row controls: add row, delete row, move up, move down, undo, redo.
- On phones the MathLive virtual keyboard opens when a math box is selected, and plain text uses the normal phone keyboard.

Build notes: MathLive (MIT licensed) supplies the math boxes, on-screen math keyboard, LaTeX import and export and static rendering. The text and math rows are built in a small rich text editor (Tiptap or similar) with a custom math node, or as plain rows with MathLive boxes in them. Claude Code picks the simpler one in Phase 7. The saved result is always the dollar sign format above, so the editor can be swapped later.

Student flow:

1. The student types the working, or photographs it.
2. For photos, Gemini transcribes to the same dollar sign format: sentences as text, maths as LaTeX, one row per line of the handwriting.
3. The editor shows the rows. Parts the transcription was unsure about are underlined in orange and the editor jumps to them. The original photo stays visible beside or above the rows while fixing.
4. The student confirms, and the job goes to the queue.

Grading for problems:

- Method marks: correct formula, correct substitution, correct intermediate steps. Written reasoning (why this formula, the stated assumption, the conclusion sentence) can earn marks as well.
- Final answer: compared with a tolerance, and units are checked.
- Uses the formulas and tables in the course notes. Distribution tables and formula sheets are stored as figures so they stay 1:1.
- Feedback shows the student's rows with the first wrong step marked, then the worked solution (also in text and math).
- Progress adds the step "Checking calculations".

## 8. Data model (draft)

- `auth.users` (managed by Supabase Auth)
- `profile(id, user_id, name, role[student|admin], status[pending|active|disabled], daily_cap, invite_limit, invited_by, approved_by, approved_at)`
- `invite(id, code, created_by, used_by, expires_at, created_at)`
- `course(id, name)`
- `chapter(id, course_id, number, title)` (one PDF per chapter)
- `source_pdf(id, chapter_id, filename, page_count)`
- `page_text(id, pdf_id, page, text)`
- `figure(id, pdf_id, chapter_id, page, bbox, label, caption, blob_path)`
- `exam(id, course_id, name, weight, format[mcq|cq|both], mcq_marks, cq_marks, mcq_seconds, chapter_ids, sort_order)`
- `exam_set_settings(exam_id, mcq_count, cq_count, cq_marks)`
- `question(id, course_id, chapter_id, kind[mcq|cq|problem], text, marks, origin[manual|ai], figure_id, status[draft|approved])`
- `mcq_option(id, question_id, label, text, is_correct, explanation)`
- `question_set(id, exam_id, name, origin[auto|curated], question_ids, created_by, created_at)`
- `session_run(id, user_id, set_id, sections, chapter_ids, started_at, finished_at)`
- `attempt(id, session_run_id, question_id, user_id, answer_text (text with $...$ math), working_rows, answer_photo_paths, transcription, selected_option, score, seconds_spent, feedback_json)`
- `api_slot(id, key_name, model, next_allowed_at, cooldown_until, priority, enabled)`
- `job(id, user_id, kind[transcribe|grade|generate], payload, status[queued|running|done|failed], priority, attempts, slot_id, created_at, finished_at, result)`

## 9. Optional report PDF

- Button labelled "Save report PDF" on the results screen and on each CQ feedback screen. Nothing is generated unless clicked.
- Implementation: a print stylesheet in RoboNuggets style plus the browser's "Save as PDF". No server rendering needed.
- Contents: score summary, accuracy by chapter, each question with the answer, the feedback, and the original figures used.

## 10. API endpoints (draft)

- Auth: Supabase Auth for sign-in. `POST /api/signup` checks the invite code and creates the user with a `pending` profile (public sign-up is off).
- Invites: `POST /api/invites` (create a code), `GET /api/invites/mine`.
- `GET /api/courses`, `GET /api/courses/{id}/exams`, `GET /api/exams/{id}/sets`
- `POST /api/exams/{id}/sets` (new random set)
- `GET /api/questions?course=&chapters=&kind=`
- `POST /api/sessions`, `POST /api/sessions/{id}/finish`
- `POST /api/mcq/{id}/answer`
- `POST /api/cq/{id}/transcribe`, `POST /api/cq/{id}/grade` (both create jobs)
- `GET /api/jobs/{id}` (poll, also runs the tick)
- `GET /api/attempts`
- `GET /api/figures/{id}` (login-protected, cached)
- Admin only: `/api/admin/exams`, `/api/admin/questions`, `/api/admin/sets`, `/api/admin/students` (approve, disable, reset password), `/api/admin/router`
- The import tool (laptop) talks to the database and storage directly with its own credentials, not through these routes.

## 11. UI specification (RoboNuggets style)

Palette (only these, orange is for emphasis):

- Background cream `#F2EFE8`, ink `#1C1A16`, muted `#6F6A5C`, orange `#FF6B1A`, card `#FAF8F2`.

Type: Outfit 400/500/600 for text, Doto 900 for one accent word per title, small uppercase letter-spaced labels. Math uses MathLive's own math fonts.

| Component | Style |
|---|---|
| Question card (MCQ, CQ, problem) | 2px orange border, 8px radius, card background, hard orange shadow (8px 8px 0) |
| MCQ option card | 2px ink border, 8px radius, card background, hard black shadow (6px 6px 0) |
| CQ answer box, form inputs | Same as MCQ option card |
| Option, correct | Orange fill, card pressed toward its shadow |
| Option, wrong | Black fill with cream text, card pressed |
| Explanation box (MCQ) | 2px dashed ink border, 8px radius, orange label with source page, short text |
| Timer / stopwatch | Small black pill in the top bar with orange digits |
| Figure card | 1px ink border, original image, caption with label, source file and page |
| Pickers (course, section, chapters, set) | Pill buttons, selected pill is black |
| Exam cards | Ink border and black shadow, selected card orange and pressed, chips show MCQ and CQ |
| Progress steps | Dashed rows, DONE chip black with orange text, NOW chip orange, waiting in muted text, orange fill bar labelled "Estimated" |
| Math editor | Answer-box style with numbered rows. Text rows hold sentences with small inline math boxes, equation rows are centred. Selected row has an orange left bar, low-confidence parts underlined in orange |
| Math toolbar | Small bordered keys in card color, active key black. Left group inserts Text row, Equation row, Inline math |
| Game panel | Same as the answer box (black shadow), pixel board in cream, ink and orange |
| Feedback cards | 1px ink border, small uppercase label, orange only for "missing points" and accents |
| Admin tabs | Small pill tabs, active tab black |

Screens (see exam-ui-mockup-v5.png):

1. Home, in this order: course, exam (cards show chapters and weight for that course), section (when the exam has both), chapters (preselected from the exam, tap to narrow), set (Set 1, Set 2, Set 3, new random set), Start.
2. MCQ practice with countdown.
3. CQ practice, typing, with stopwatch and the source figure.
4. CQ practice, handwritten photo, with transcription fix.
5. CQ feedback with marks, covered and missing points, corrections, grammar, improved answer.
6. Results and weak topics, with optional "Save report PDF".
7. Grading: progress steps, estimated bar, and the waiting game.
8. Admin: AI request router status (slots, queue, pace).
9. Student login portal (sign in, create account with invite code).
10. Admin portal: exams, set settings, students with "invited by" and approval.
11. Numerical problem: transcription as mixed text and math rows with the insert and math toolbars.

Mobile: single column, large tap targets, photo upload opens the phone camera, the game uses swipe, the math field uses the on-screen math keyboard.

## 12. Build phases

1. Phase 1: Next.js app on Vercel, new Supabase project (Auth, tables, RLS policies, private buckets), roles, invite codes and approval, admin shell, courses, chapters and exams (both known courses entered).
2. Phase 2: Import tool with text extraction and 1:1 figure extraction with the review screen.
3. Phase 3: Question bank (your own plus AI generation) and set builder.
4. Phase 4: MCQ practice with countdown, dashed explanation, full styling.
5. Phase 5: Request router, job queue, CQ typed grading, feedback screen, stopwatch, staged progress, game.
6. Phase 6: Photo upload (compressed on device, deleted after grading) and transcription correction.
7. Phase 7: Math editor and numerical problem grading (IPE 6112).
8. Phase 8: History, weak topics, optional report PDF, student limits, usage view in admin, polish.

## 13. Open questions

1. IPE 6112: which topics go into Mid-term 1, Mid-term 2 and the final? (Low priority, the admin can enter it later.)
2. Final exam defaults for Sourcing & Procurement (6 CQs of 5 marks) and CT sets (10 MCQs) are assumptions. Change them if the real papers differ.

Defaults I will use unless you say otherwise: 10 AI gradings per student per day, 3 unused invite codes per member, invite codes expire in 7 days, students' answers private, Snake as the first game, answer photos deleted after grading.

## 14. Risks

- Handwriting and math recognition errors (mitigated by the correction step and the math editor).
- Free-tier limits and model changes (mitigated by the router, queue, per-student caps and configurable models).
- A Google project being flagged for using extra projects (mitigated by a switch to turn off Key B).
- Supabase free project pausing after a week of inactivity (mitigated by a daily keep-alive cron job and a reminder to restore from the dashboard).
- Supabase free storage (1 GB) filling up (mitigated by compressing and deleting photos, usage view in admin).
- Wrong or missing RLS policies leaking data (mitigated by policies as migrations, tests with two student accounts, and no public sign-up).
- Hallucinated feedback (mitigated by grounding in chapter text, page references and the not-in-source rule).
- Wrong figure crops (mitigated by the import review screen).
- Friends sharing one free quota (mitigated by the daily cap and the queue).

## 15. Build workflow: Claude Code and GitHub

Repository (private, one repo):

- `app/` the Next.js app.
- `import-tool/` the Python PDF import tool.
- `docs/PLAN.md` this plan.
- `docs/design/` the mockup (PNG and HTML), the Sourcing & Procurement marking scheme screenshot and the IPE 6112 info sheet.
- `CLAUDE.md` at the root: stack, commands, conventions, and the rules below. I can write this file and the per-phase prompts when you want them.

Rules for `CLAUDE.md`:

- Follow `docs/PLAN.md` and the design tokens in section 11.
- Never commit secrets, keys, `.env` files, course PDFs or student data.
- Every table has RLS enabled with tested policies. The browser uses only the anon key. The service role key is used only in server routes (invite sign-up, admin actions, queue ticks, import tool). Admin routes check the admin role.
- Gemini calls go only through the request router and the job queue.
- Model names, key order and pacing come from configuration.
- Each phase ends with a short checklist of things to verify by hand.

Workflow:

- One GitHub issue or milestone per phase, with acceptance checks (for example Phase 1: a friend signs up with a code, shows as pending, you approve, they can sign in).
- One branch and pull request per feature, `main` protected. Vercel makes a preview deployment for every pull request and deploys production when you merge.
- Environment variable names (values only in Vercel settings and a local `.env.local` that is git-ignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never exposed to the browser), `CRON_SECRET`, `GEMINI_KEY_A`, `GEMINI_KEY_B`, `GEMINI_MODEL_PRIMARY`, `GEMINI_MODEL_BACKUP`, `ADMIN_EMAIL` (seeds the first admin).
- The import tool uses its own git-ignored `.env` with the Supabase URL and service role key.
- Building the app with Claude Code uses your Claude plan. The running site uses the free Gemini API keys, so there is no separate Claude API bill.
- First instruction to give Claude Code: build Phase 1 following `docs/PLAN.md`, then stop and list what to verify.
