# Phase 3: what to verify by hand

Phase 3 adds the question bank, the set builder, and a minimal request router and job queue (the router is pulled forward from Phase 5 because AI question generation must go through it). The database logic is covered by automated tests. The admin screens and the full generate-and-poll loop were type-checked and built but not clicked through (I did not create a test admin account in your live project), so steps 2 to 9 are the real test.

## Setup

1. The migration `20261030210000_question_bank_sets_router.sql` is already applied to the Supabase project. If you ever rebuild the project, run all files in `supabase/migrations/` in order.
2. `app/.env.local` needs `GEMINI_KEY_A`, `GEMINI_MODEL_PRIMARY` and `GEMINI_MODEL_BACKUP` (and `GEMINI_KEY_B` if you use the second Google project). They are already filled in on your machine. On Vercel add the same variables.
3. `cd app && npm install` (a new package, `@google/genai`, was added).

## Automated checks

- `npm test` in `app`: 12 tests for error handling, slot setup and the strict checking of AI output.
- `supabase/tests/phase3.sql`: paste it into the Supabase SQL editor and run it. The last result must read `ALL PHASE 3 TESTS PASSED`. It covers who can read and write questions, saving MCQs, building random sets, and how the router picks slots and jobs. Everything rolls back.
- `supabase/tests/rls.sql` still ends with `ALL RLS TESTS PASSED`.

## Checklist

1. **Tabs.** Sign in as admin. The admin bar now has Exams, Chapters, Questions, Sets, AI router, Students.
2. **Add questions by hand.** Questions, then "+ New question". Pick a chapter and MCQ. Fill in the question, four options with explanations, mark the correct one, press "Save and approve". It appears in the list as Approved. Open it with Edit, change something, save again. Try "Save as draft" too. Add one CQ with key points.
3. **Figure on a question.** On a chapter that has uploaded figures, pick one in the Figure list. A preview of the original figure appears. Save, reopen, the figure is still chosen.
4. **Generate with AI.** On the Questions tab open "Generate questions with AI", pick an imported chapter, MCQ, 3 questions, press Generate. The job shows "queued" then "running" then "done". The list fills with drafts that have the AI chip and a source page.
5. **Check the AI drafts against the PDF.** Open "Options and answer" on each. Is the answer right, are the explanations right, is the page number right? Edit or delete the bad ones, approve the good ones. Do the same once with CQ (key points are listed under the question).
6. **Router tab.** AI router lists four slots (Key A primary and backup, Key B primary and backup) with their model names and "Ready" or "Pacing". The latest jobs show underneath. Switch the Key B slots off and on, change a pace and save.
7. **A failing job.** On the AI router tab, switch every slot off, then generate again. The job stays queued (nothing is lost). Switch the slots back on, press "Run a tick now": it runs.
8. **Random set.** Sets tab, pick an exam, press "New random set". You land on "Set 1" with the exam's target of MCQs and CQs, spread over its chapters, only approved questions. Press "New random set" again: Set 2 differs. If the exam has fewer approved questions than its target, the set is simply smaller.
9. **Hand-picked set.** "New empty set", then add approved questions with "Add to set", move them Up and Down, Remove one, Rename the set, Delete a set.
10. **Students see only approved questions.** As a student (private window) nothing in the admin area opens. The API `/api/exams/<exam id>/sets` lists the sets with their question counts, and a student can POST to it to get another random set.
11. **Drafts stay hidden.** A draft question never appears in a random set.

## Tested against the real Gemini API

I ran one chapter of your Sourcing course through the real prompt and both models (nothing written to the database). A CQ and an MCQ came back valid, grounded in the notes, with correct page numbers. Both models answered "503 high demand" part of the time during that test. The router treats 503 like a rate limit: the slot rests for 30 seconds and the next slot takes the job, without using up one of the job's three attempts. If a generation sits at "queued" for a minute or two, that is why. Retry from the AI router tab if it ends up "failed".

## Known gaps and assumptions

- Students have no screen for sets yet. The home screen with pickers comes with Phase 4 (MCQ practice).
- Students cannot read the MCQ options table directly, because it holds the answer key. Phase 4 serves the options without the key and reveals the answer after they pick.
- A job runs when a page polls `/api/jobs/<id>` (the Questions and AI router pages do this on their own) or when the daily cron fires. If nobody opens those pages, queued jobs wait.
- Pace per slot defaults to 12 seconds (5 requests per minute). Change it per slot on the AI router tab.
- The real limits of `gemini-3.8-flash` and `gemini-3.6-flash` on your Google projects are shown in Google AI Studio. This build could not read them.
- Problem (numerical) questions can be added by hand. AI generation covers MCQ and CQ only. Problems arrive with Phase 7.
