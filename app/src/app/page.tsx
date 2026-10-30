import Link from "@/components/NavLink";
import { InvitePanel } from "@/components/InvitePanel";
import { StartPractice, type CourseView } from "@/components/StartPractice";
import { requireActive } from "@/lib/auth";
import { toInviteViews } from "@/lib/invites";
import { percent } from "@/lib/practice";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

function nowIso() {
  return new Date().toISOString();
}

// The start of today in Bangladesh time (UTC+6, no daylight saving), as a UTC timestamp. The daily AI grading cap resets then.
function startOfDhakaDay() {
  const shifted = new Date(Date.now() + 6 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 6 * 3600_000).toISOString();
}

export default async function HomePage() {
  const { profile } = await requireActive();
  const supabase = await createClient();

  const [{ data: courses }, { data: invites }, { data: runs }, { data: open }, { count: gradesToday }] = await Promise.all([
    supabase
      .from("course")
      .select(
        `id, name, short_name,
         exam(id, name, weight, format, mcq_seconds, sort_order,
           exam_chapter(chapter(id, number, title)),
           question_set(id, name, chapter_id, created_at, question_set_item(question(chapter_id, kind))))`,
      )
      .order("sort_order"),
    supabase.from("invite").select("*").eq("created_by", profile.id).order("created_at", { ascending: false }),
    // Finished full-set sessions (not retries of missed questions), newest first, for "Set 1 · 80%".
    supabase
      .from("session_run")
      .select("set_id, sections, score, max_score")
      .eq("user_id", profile.id)
      .is("retry_of", null)
      .not("set_id", "is", null)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(500),
    // A session you left open and can still finish.
    supabase
      .from("session_run")
      .select("id, started_at, exam(name)")
      .eq("user_id", profile.id)
      .is("finished_at", null)
      .or(`mcq_deadline_at.is.null,mcq_deadline_at.gt.${nowIso()}`)
      .order("started_at", { ascending: false })
      .limit(1),
    // AI gradings used today. Failed jobs do not count, same rule as the database.
    supabase
      .from("job")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("kind", "grade")
      .neq("status", "failed")
      .gte("created_at", startOfDhakaDay()),
  ]);

  // MCQ history drives the "Set 1 · 80%" pills. CQ sessions are only counted, their marks arrive after AI grading.
  const history = new Map<string, { attempts: number; cqAttempts: number; lastPercent: number | null }>();
  for (const r of runs ?? []) {
    if (!r.set_id) continue;
    const h = history.get(r.set_id) ?? { attempts: 0, cqAttempts: 0, lastPercent: null };
    if (r.sections.includes("cq")) {
      h.cqAttempts += 1;
    } else {
      h.attempts += 1;
      if (h.lastPercent === null && r.score !== null && r.max_score !== null) h.lastPercent = percent(r.score, r.max_score);
    }
    history.set(r.set_id, h);
  }

  const courseViews: CourseView[] = (courses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    short: c.short_name,
    exams: [...c.exam]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => ({
        id: e.id,
        name: e.name,
        weight: Number(e.weight),
        format: e.format,
        mcqSeconds: e.mcq_seconds,
        chapters: e.exam_chapter.flatMap((ec) => (ec.chapter ? [ec.chapter] : [])).sort((a, b) => a.number - b.number),
        sets: [...e.question_set]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((s) => {
            const mcqByChapter: Record<string, number> = {};
            const cqByChapter: Record<string, number> = {};
            for (const item of s.question_set_item) {
              if (!item.question) continue;
              const bucket = item.question.kind === "mcq" ? mcqByChapter : item.question.kind === "cq" || item.question.kind === "problem" ? cqByChapter : null;
              if (bucket) bucket[item.question.chapter_id] = (bucket[item.question.chapter_id] ?? 0) + 1;
            }
            const h = history.get(s.id);
            return { id: s.id, name: s.name, chapterId: s.chapter_id, mcqByChapter, cqByChapter, attempts: h?.attempts ?? 0, cqAttempts: h?.cqAttempts ?? 0, lastPercent: h?.lastPercent ?? null };
          }),
      })),
  }));

  const isAdmin = profile.role === "admin";
  const openSession = open?.[0];

  return (
    <main className="shell shell-wide">
      <div className="between">
        <span className="label">Exam Practice Studio</span>
        <div className="wrap">
          {isAdmin ? (
            <Link href="/admin" className="pill">
              Admin
            </Link>
          ) : null}
          <form action={signOut}>
            <button type="submit" className="btn btn-small">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="stack-sm">
        <h1 className="title">
          Pick your <span className="accent">Exam</span>
        </h1>
        <p className="muted">Hi {profile.name}. Pick the course first. Each course has its own exam pattern.</p>
      </div>

      {openSession ? (
        <div className="dashed between">
          <p className="small">
            You left a {openSession.exam?.name ?? "practice"} session open.
          </p>
          <Link href={`/practice/${openSession.id}`} className="btn btn-small btn-primary">
            Continue
          </Link>
        </div>
      ) : null}

      <StartPractice courses={courseViews} cap={{ used: gradesToday ?? 0, limit: profile.daily_cap }} />

      <InvitePanel invites={toInviteViews(invites ?? [])} limit={isAdmin ? null : profile.invite_limit} />

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
