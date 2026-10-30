# Phase 1: what to verify by hand

## One-time setup (before anything else)

1. Supabase dashboard, Authentication, Sign In / Providers: switch OFF "Allow new users to sign up". (The app creates accounts through a server route, so this stays off.)
2. Supabase dashboard, Project Settings, API Keys: copy the `service_role` key into `app/.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. Check `ADMIN_EMAIL` in the same file is your admin email.
3. Run `cd app && npm run dev`, open http://localhost:3000.
4. Do the admin sign-up (step 1 below) before sharing the URL with anyone.

## Checklist

1. **Admin account.** Open `/signup`, enter `ADMIN_EMAIL`, a name and a password, leave the invite code empty. You should land on the login screen. Sign in. You should reach the home page with an "Admin" button. (This only works while no admin exists.)
2. **Admin portal.** Open `/admin`. Exams tab shows Sourcing & Procurement (CT-1, CT-2, Midterm, Final) and IPE 6112 (Mid-term 1, Mid-term 2, Final). Open Midterm: 10 MCQs, 4 CQs, 5 marks per CQ, 10 minute timer, chapters 1, 2, 3. Change a number, press Save exam, see "Saved."
3. **Invite.** On the home page press "New code". A code like `1A2B-3C4D-5E6F` appears. "Copy link" copies a `/signup?code=...` link.
4. **Friend signs up.** In a private window open the copied link, fill in name, email, password, press Create account. You are sent to the login screen with an "Account created" note.
5. **Pending.** Sign in as the friend. You see "Almost THERE" (the waiting screen). Open `/` and `/admin` by hand: both bounce back to the waiting screen.
6. **Approve.** As admin, open Admin, Students. The friend shows "Pending, approve" and "invited by <you>". Press Approve.
7. **Sign in.** The friend signs out and in again and reaches the home page. `/admin` sends them back to `/`.
8. **Invite limit.** As the friend press "New code" three times. The fourth press is refused ("You already have 3 unused invite codes").
9. **Other admin actions.** Disable the friend, try signing in (waiting screen says the account is off), Enable again. Set a new password for the friend and sign in with it. Change the daily cap and invite limit and press Save limits.
10. **Used and expired codes.** Reuse the friend's code in a private window: "That invite code is not valid or has expired."
11. **RLS check with two students.** Create a second friend the same way. Each student sees only their own invite codes on the home page. Neither can open `/admin`.
12. **RLS automated test.** In the Supabase SQL editor paste `supabase/tests/rls.sql` and run it. The last result must read `ALL RLS TESTS PASSED`. Everything is rolled back, no data remains.
13. **Keep-alive cron.** With the dev server running:
    `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/keepalive` returns `{"ok":true}`. Without the header it returns 401.

## Vercel (when you deploy)

Set Root Directory to `app` and add all variables from `app/.env.example`. The daily cron in `app/vercel.json` needs `CRON_SECRET` set in Vercel.

## Known gaps and assumptions

- The Supabase project is in eu-west-1 (Ireland). The plan asked for Singapore. It works the same but is a little slower from Bangladesh. Moving needs a new project.
- IPE 6112 Mid-term 1 and 2 are seeded at 20% each (the info sheet says 40% for both). Their topics are blank. The nine course topics are seeded as chapters 1 to 9.
- Sourcing & Procurement chapters are named "Chapter 1" to "Chapter 7" until the PDFs are imported.
- Rate limiting on `/api/signup` is not in place. Codes carry 48 bits of randomness and expire in 7 days.
- Photo storage buckets (`figures`, `answer-photos`) exist and are private with policies, but nothing uses them until Phase 2 and 6.
