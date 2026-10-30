# Prompt for Claude Code: Phase 1

Read CLAUDE.md and docs/PLAN.md. Build Phase 1 only:

1. Create the Next.js (TypeScript, App Router) app in `app/` and initialise git. Set it up for Vercel.
2. Connect to my new Supabase project (I will put the keys in `app/.env.local`; create `.env.example` with the variable names only).
3. Write migrations in `supabase/migrations/` for: profile, invite, course, chapter, exam, exam_set_settings (plan section 8), with RLS policies for each.
4. Login page and create-account page (invite code required). Public sign-up is off. A server route validates the code and creates the user as `pending`.
5. Roles and approval: ADMIN_EMAIL becomes admin on first sign-in. Pending users see a waiting screen.
6. Any active member can create invite codes (max 3 unused, expire in 7 days). Show "invited by" in the admin student list.
7. Admin portal shell at `/admin`: Exams (courses, exams per course, set settings), Students (approve, disable, reset password, daily cap, invite limits).
8. Seed both courses: Sourcing & Procurement (CT-1, CT-2, Midterm, Final) and IPE 6112 (Mid-term 1, Mid-term 2, Final, topics blank), using plan section 2.
9. Style with the plan section 11 tokens, matching screens 09 and 10 of the mockup.
10. Add a daily cron route (protected by CRON_SECRET) that runs one small query to keep Supabase awake.
11. Write RLS tests with two student accounts and one admin.

When done, stop and give me a checklist to verify by hand (sign up with a code, shows pending, approve, sign in, invite someone, RLS check).
