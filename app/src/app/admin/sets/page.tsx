import Link from "@/components/NavLink";
import { ActionForm } from "@/components/ActionForm";
import { adminCourses } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";
import { createAutoSet, createEmptySet } from "./actions";

type SearchParams = Promise<{ course?: string; exam?: string }>;

export default async function SetsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const courses = await adminCourses(supabase);
  const course = (courses ?? []).find((c) => c.id === sp.course) ?? courses?.[0];
  if (!course) return <p className="small muted">No courses yet. Add one on the Exams tab.</p>;

  const { data: exams } = await supabase.from("exam").select("*, exam_set_settings(*), exam_chapter(chapter_id, chapter(number))").eq("course_id", course.id).order("sort_order");
  const exam = (exams ?? []).find((e) => e.id === sp.exam) ?? exams?.[0];

  const chapterIds = exam?.exam_chapter.map((c) => c.chapter_id) ?? [];
  const chapterOptions = (exam?.exam_chapter ?? []).flatMap((c) => (c.chapter ? [{ id: c.chapter_id, number: c.chapter.number }] : [])).sort((a, b) => a.number - b.number);
  // Sets can cover the whole exam or one chapter. Students see chapter sets only when they pick that chapter.
  const scopeSelect = (
    <select name="chapter_id" className="select input-sm" aria-label="Set covers" defaultValue="">
      <option value="">Whole exam</option>
      {chapterOptions.map((c) => (
        <option key={c.id} value={c.id}>
          Ch {c.number} only
        </option>
      ))}
    </select>
  );
  const [{ data: pool }, { data: sets }] = exam
    ? await Promise.all([
        chapterIds.length ? supabase.from("question").select("kind").eq("status", "approved").in("chapter_id", chapterIds) : Promise.resolve({ data: [] as { kind: string }[] }),
        supabase.from("question_set").select("id, name, origin, created_at, question_set_item(question(kind))").eq("exam_id", exam.id).order("created_at"),
      ])
    : [{ data: [] as { kind: string }[] }, { data: [] }];

  const poolMcq = (pool ?? []).filter((q) => q.kind === "mcq").length;
  const poolCq = (pool ?? []).length - poolMcq;
  const settings = exam?.exam_set_settings;

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <h1 className="heading">
          Sets <span className="accent">{(sets ?? []).length}</span>
        </h1>
        <p className="small muted">A set is a saved list of questions for one exam. Random sets spread the questions across the exam&apos;s chapters.</p>
      </div>

      <div className="stack-sm">
        <p className="label">Course</p>
        <div className="wrap">
          {(courses ?? []).map((c) => (
            <Link key={c.id} href={`/admin/sets?course=${c.id}`} className="pill" aria-current={c.id === course.id ? "page" : undefined}>
              {c.short_name ?? c.name}
            </Link>
          ))}
        </div>
        <p className="label">Exam</p>
        <div className="wrap">
          {(exams ?? []).map((e) => (
            <Link key={e.id} href={`/admin/sets?course=${course.id}&exam=${e.id}`} className="pill" aria-current={e.id === exam?.id ? "page" : undefined}>
              {e.name}
            </Link>
          ))}
          {(exams ?? []).length === 0 ? <span className="small muted">No exams yet. Add them on the Exams tab.</span> : null}
        </div>
      </div>

      {exam ? (
        <>
          <div className="card stack-sm">
            <p className="label label-orange">{exam.name}</p>
            <p className="small">
              Target per set: {settings?.mcq_count ?? 0} MCQ and {settings?.cq_count ?? 0} CQ. Approved questions available: {poolMcq} MCQ and {poolCq} CQ
              {chapterIds.length === 0 ? ". This exam has no chapters yet, link them on the Exams tab." : "."}
            </p>
            <div className="wrap" style={{ gap: 14 }}>
              <ActionForm action={createAutoSet} submitLabel="New random set" buttonClass="btn btn-primary" className="wrap">
                <input type="hidden" name="exam_id" value={exam.id} />
                {scopeSelect}
              </ActionForm>
              <ActionForm action={createEmptySet} submitLabel="New empty set" buttonClass="btn" className="wrap">
                <input type="hidden" name="exam_id" value={exam.id} />
                {scopeSelect}
              </ActionForm>
            </div>
          </div>

          <div className="card rows">
            {(sets ?? []).map((s) => {
              const kinds = s.question_set_item.map((i) => i.question?.kind);
              const mcq = kinds.filter((k) => k === "mcq").length;
              return (
                <Link key={s.id} href={`/admin/sets/${s.id}`} className="row row-link">
                  <span className="row-name">{s.name}</span>
                  <span className="wrap">
                    <span className="small">{mcq} MCQ · {kinds.length - mcq} CQ</span>
                    <span className={`chip ${s.origin === "auto" ? "chip-muted" : "chip-done"}`}>{s.origin === "auto" ? "Random" : "Hand-picked"}</span>
                  </span>
                </Link>
              );
            })}
            {(sets ?? []).length === 0 ? <p className="small muted">No sets yet for this exam.</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
