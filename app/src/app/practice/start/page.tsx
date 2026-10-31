import { notFound } from "next/navigation";
import { BeginSession } from "@/components/BeginSession";
import { requireActive } from "@/lib/auth";
import { setLabel, startOfDhakaDay, UUID_RE } from "@/lib/practice";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Before you start | Exam Practice Studio" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ set?: string; section?: string; ch?: string }>;

// The exam screen before the session exists: the briefing, then Begin. The session and the MCQ timer
// only start when Begin is pressed, so reading the instructions takes no exam time.
export default async function StartPage({ searchParams }: { searchParams: SearchParams }) {
  const { set: setId, section: sectionParam, ch } = await searchParams;
  if (!setId || !UUID_RE.test(setId)) notFound();
  const section = sectionParam === "cq" ? "cq" : "mcq";
  const picked = (ch ?? "").split(",").filter((id) => UUID_RE.test(id));

  const { profile } = await requireActive();
  const supabase = await createClient();
  const [{ data: set }, { count: gradesToday }] = await Promise.all([
    supabase
      .from("question_set")
      .select("id, name, chapter_id, exam(name, format, mcq_seconds, exam_chapter(chapter_id)), question_set_item(question(chapter_id, kind, marks))")
      .eq("id", setId)
      .maybeSingle(),
    // AI gradings used today, same rule as the home screen and the database.
    supabase
      .from("job")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("kind", "grade")
      .neq("status", "failed")
      .gte("created_at", startOfDhakaDay()),
  ]);
  if (!set?.exam) notFound();
  const exam = set.exam;
  if ((section === "cq" && exam.format === "mcq") || (section === "mcq" && exam.format === "cq")) notFound();

  // No chapters in the link means every chapter of the exam.
  const chapters = picked.length ? picked : exam.exam_chapter.map((ec) => ec.chapter_id);
  const items = set.question_set_item.flatMap((i) => (i.question && chapters.includes(i.question.chapter_id) ? [i.question] : []));
  const ofSection = items.filter((q) => (section === "mcq" ? q.kind === "mcq" : q.kind === "cq" || q.kind === "problem"));
  const marks = ofSection.reduce((sum, q) => sum + q.marks, 0);
  const noun = section === "cq" ? "CQ" : "MCQ";

  return (
    <main className="shell shell-practice">
      <div className="between">
        <p className="label">
          {exam.name} / {noun}
        </p>
        <span className="timer-pill">NOT STARTED</span>
      </div>
      <BeginSession
        setId={set.id}
        section={section}
        chapterIds={picked.length ? picked : undefined}
        title={`${exam.name} / ${noun} · ${setLabel({ name: set.name, chapterId: set.chapter_id }, chapters)}`}
        questionCount={ofSection.length}
        marks={marks}
        mcqSeconds={exam.mcq_seconds}
        capLeft={Math.max(0, profile.daily_cap - (gradesToday ?? 0))}
        capLimit={profile.daily_cap}
      />
    </main>
  );
}
