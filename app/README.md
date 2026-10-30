# Exam Practice Studio (app)

Next.js (App Router, TypeScript) on Vercel with a Supabase project. Plan: `../docs/PLAN.md`. Rules: `../CLAUDE.md`.

## Run locally

```bash
cd app
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Variables (names only, values go in `.env.local` and the Vercel settings):

| Name | Where it is used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server, anon key only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only: invite sign-up, admin student actions, cron |
| `CRON_SECRET` | Protects `/api/cron/keepalive` |
| `ADMIN_EMAIL` | The first sign-in or sign-up with this email becomes the admin |
| `GEMINI_*` | Not used until Phase 5 |

## Database

SQL migrations live in `../supabase/migrations/` and are the source of truth. RLS tests are in `../supabase/tests/rls.sql`.

## Deploying to Vercel

Set the project Root Directory to `app`. Add the variables above. `vercel.json` registers the daily keep-alive cron (Vercel sends `CRON_SECRET` as a bearer token).

## Layout

- `src/proxy.ts` refreshes the session and sends signed-out visitors to `/login`.
- `src/lib/auth.ts` loads the profile, promotes `ADMIN_EMAIL`, and provides `requireActive()` and `requireAdmin()`.
- `src/lib/supabase/` has the three clients: `server.ts` (acts as the user, RLS applies), `admin.ts` (service role, server only).
- `src/app/api/signup` is the only way to create an account (public sign-up is off in Supabase).
- `src/app/admin/` is the admin portal: Exams and Students.
