# CLAUDE.md

Exam practice website for Nabil and friends (BUET IPE). Read `docs/PLAN.md` first. It is the source of truth. The UI reference is `docs/design/exam-ui-mockup-v5.png`.

## Stack
- Next.js (App Router, TypeScript) on Vercel
- A NEW Supabase project: Auth (email and password, public sign-up OFF), Postgres with RLS, private Storage buckets
- Gemini API (free tier) only through the request router and job queue (plan section 5b)
- MathLive for math input and display
- `import-tool/`: Python (PyMuPDF), run on the laptop, not deployed

## Rules
- Never commit secrets, `.env*` files, course PDFs or student data. Keep `.env.local` git-ignored.
- Every table has RLS with tested policies. Browser code uses only the anon key. The service role key is used only in server routes (invite sign-up, admin actions, queue ticks, import tool).
- Gemini calls only through the router and queue. Model names, key order and pacing come from configuration.
- MCQ answering never calls the AI.
- Figures are 1:1 copies extracted from the PDF, never redrawn.
- Schema changes are SQL migrations in `supabase/migrations/`, committed to the repo.
- UI follows plan section 11 (RoboNuggets style: cream background, orange question shadow, black option shadow, dashed explanation box). No em dashes in any UI text.
- Single branch: `main` is the only branch. Commit and push to it directly. No feature branches or pull requests unless Nabil asks for one.
- Never add Claude as a co-author or add attribution lines to commits or pull requests. Commits carry Nabil's name only.
- At the end of each phase, stop and list what Nabil should verify by hand.

## Environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `CRON_SECRET`, `GEMINI_KEY_A`, `GEMINI_KEY_B`, `GEMINI_MODEL_PRIMARY`, `GEMINI_MODEL_BACKUP`, `ADMIN_EMAIL`.

## Phases
See plan section 12. Work on one phase at a time.
