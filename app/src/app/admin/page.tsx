import Link from "@/components/NavLink";
import { ActionForm } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { addChapter, addCourse, addExam, deleteChapter, deleteExam, updateExam } from "./actions";

type SearchParams = Promise<{ course?: string; exam?: string }>;

const FORMAT_LABEL = { mcq: ["MCQ"], cq: ["CQ"], both: ["MCQ", "CQ"] } as const;

export default async function AdminExamsPage({ searchParams }: { searchParams: SearchParams }) {
  const { course: courseParam, exam: examParam } = await searchParams;
  const supabase = await createClient();

  const { data: courses } = await supabase.from("course").select("*").order("sort_order");
  const course = (courses ?? []).find((c) => c.id === courseParam) ?? courses?.[0];

  if (!course) {
    return (
      <section className="stack">
        <div className="card-shadow stack">
          <p className="label label-orange">No courses yet</p>
          <ActionForm action={addCourse} submitLabel="Add course" className="inline-form">
            <div className="field">
              <label className="label" htmlFor="new-course">Course name</label>
              <input id="new-course" name="name" className="input input-sm" required />
            </div>
          </ActionForm>
        </div>
      </section>
    );
  }

  const [{ data: chapters }, { data: exams }] = await Promise.all([
    supabase.from("chapter").select("*").eq("course_id", course.id).order("number"),
    supabase
      .from("exam")
      .select("*, exam_set_settings(*), exam_chapter(chapter_id)")
      .eq("course_id", course.id)
      .order("sort_order"),
  ]);

  const chapterNumber = new Map((chapters ?? []).map((c) => [c.id, c.number]));
  const selected = (exams ?? []).find((e) => e.id === examParam);

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <p className="label">Course</p>
        <div className="wrap">
          {(courses ?? []).map((c) => (
            <Link key={c.id} href={`/admin?course=${c.id}`} className="pill" aria-current={c.id === course.id ? "page" : undefined}>
              {c.short_name ?? c.name}
            </Link>
          ))}
        </div>
        <details>
          <summary className="label" style={{ cursor: "pointer" }}>+ Add course</summary>
          <ActionForm action={addCourse} submitLabel="Add course" className="inline-form" >
            <div className="field">
              <label className="label" htmlFor="course-name">Full name</label>
              <input id="course-name" name="name" className="input input-sm" required />
            </div>
            <div className="field">
              <label className="label" htmlFor="course-short">Short name</label>
              <input id="course-short" name="short_name" className="input input-sm" placeholder="Optional" />
            </div>
          </ActionForm>
        </details>
      </div>

      <div className="stack-sm">
        <p className="label">Exams for this course</p>
        <div className="card rows">
          {(exams ?? []).length === 0 ? <p className="small muted">No exams yet.</p> : null}
          {(exams ?? []).map((e) => {
            const nums = e.exam_chapter
              .map((ec) => chapterNumber.get(ec.chapter_id))
              .filter((n): n is number => n !== undefined)
              .sort((a, b) => a - b);
            return (
              <Link key={e.id} href={`/admin?course=${course.id}&exam=${e.id}`} className={`row row-link${e.id === selected?.id ? " exam-selected" : ""}`}>
                <span className="row-name">{e.name}</span>
                <span className="small">
                  {FORMAT_LABEL[e.format].join(" + ")}
                  {nums.length ? ` · Ch ${nums.join(", ")}` : " · No chapters yet"} · {Number(e.weight)}%
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="card-shadow stack">
          <p className="label label-orange">Set settings, {selected.name}</p>
          <ActionForm action={updateExam} submitLabel="Save exam" buttonClass="btn btn-primary" className="stack" key={selected.id}>
            <input type="hidden" name="id" value={selected.id} />
            <div className="inline-form">
              <div className="field" style={{ width: 200 }}>
                <label className="label" htmlFor="exam-name">Name</label>
                <input id="exam-name" name="name" className="input input-sm" defaultValue={selected.name} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="exam-weight">Weight %</label>
                <input id="exam-weight" name="weight" inputMode="decimal" className="input input-sm" defaultValue={Number(selected.weight)} required />
              </div>
              <div className="field" style={{ width: 150 }}>
                <label className="label" htmlFor="exam-format">Format</label>
                <select id="exam-format" name="format" className="select input-sm" defaultValue={selected.format}>
                  <option value="mcq">MCQ only</option>
                  <option value="cq">CQ only</option>
                  <option value="both">MCQ and CQ</option>
                </select>
              </div>
            </div>
            <div className="inline-form">
              <div className="field">
                <label className="label" htmlFor="mcq-marks">MCQ marks</label>
                <input id="mcq-marks" name="mcq_marks" inputMode="numeric" className="input input-sm" defaultValue={selected.mcq_marks} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="cq-marks">CQ marks</label>
                <input id="cq-marks" name="cq_marks" inputMode="numeric" className="input input-sm" defaultValue={selected.cq_marks} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="mcq-minutes">MCQ timer (min)</label>
                <input id="mcq-minutes" name="mcq_minutes" inputMode="decimal" className="input input-sm" defaultValue={selected.mcq_seconds / 60} required />
              </div>
            </div>
            <div className="inline-form">
              <div className="field">
                <label className="label" htmlFor="mcq-count">MCQs per set</label>
                <input id="mcq-count" name="mcq_count" inputMode="numeric" className="input input-sm" defaultValue={selected.exam_set_settings?.mcq_count ?? 10} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="cq-count">CQs per set</label>
                <input id="cq-count" name="cq_count" inputMode="numeric" className="input input-sm" defaultValue={selected.exam_set_settings?.cq_count ?? 0} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="cq-each">Marks per CQ</label>
                <input id="cq-each" name="cq_marks_each" inputMode="numeric" className="input input-sm" defaultValue={selected.exam_set_settings?.cq_marks ?? 5} required />
              </div>
            </div>
            <div className="stack-sm">
              <p className="label">Chapters in this exam</p>
              <div className="checks">
                {(chapters ?? []).map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" name="chapters" value={c.id} defaultChecked={selected.exam_chapter.some((ec) => ec.chapter_id === c.id)} />
                    Ch {c.number}
                  </label>
                ))}
                {(chapters ?? []).length === 0 ? <span className="small muted">Add chapters below first.</span> : null}
              </div>
            </div>
          </ActionForm>
          <ActionForm action={deleteExam} submitLabel="Delete exam" buttonClass="btn btn-small" confirmText={`Delete ${selected.name}? This also removes its set settings.`}>
            <input type="hidden" name="id" value={selected.id} />
          </ActionForm>
        </div>
      ) : (
        <p className="small muted">Pick an exam above to edit its chapters and set settings.</p>
      )}

      <details className="card stack-sm">
        <summary className="label" style={{ cursor: "pointer" }}>+ Add exam to {course.short_name ?? course.name}</summary>
        <ActionForm action={addExam} submitLabel="Add exam" className="inline-form">
          <input type="hidden" name="course_id" value={course.id} />
          <div className="field" style={{ width: 200 }}>
            <label className="label" htmlFor="add-exam-name">Name</label>
            <input id="add-exam-name" name="name" className="input input-sm" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="add-exam-weight">Weight %</label>
            <input id="add-exam-weight" name="weight" inputMode="decimal" className="input input-sm" defaultValue="10" required />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label" htmlFor="add-exam-format">Format</label>
            <select id="add-exam-format" name="format" className="select input-sm" defaultValue="mcq">
              <option value="mcq">MCQ only</option>
              <option value="cq">CQ only</option>
              <option value="both">MCQ and CQ</option>
            </select>
          </div>
        </ActionForm>
      </details>

      <div className="stack-sm">
        <p className="label">Chapters, {course.short_name ?? course.name}</p>
        <div className="card rows">
          {(chapters ?? []).map((c) => (
            <div key={c.id} className="row">
              <span>
                <span className="row-name">Ch {c.number}</span> <span className="muted">{c.title}</span>
              </span>
              <ActionForm action={deleteChapter} submitLabel="Delete" buttonClass="btn btn-small" confirmText={`Delete chapter ${c.number}? Exams lose the link to it.`}>
                <input type="hidden" name="id" value={c.id} />
              </ActionForm>
            </div>
          ))}
          {(chapters ?? []).length === 0 ? <p className="small muted">No chapters yet.</p> : null}
        </div>
        <ActionForm action={addChapter} submitLabel="Add chapter" className="inline-form">
          <input type="hidden" name="course_id" value={course.id} />
          <div className="field">
            <label className="label" htmlFor="chapter-number">Number</label>
            <input id="chapter-number" name="number" inputMode="numeric" className="input input-sm" required />
          </div>
          <div className="field" style={{ width: 220 }}>
            <label className="label" htmlFor="chapter-title">Title</label>
            <input id="chapter-title" name="title" className="input input-sm" placeholder="Optional" />
          </div>
        </ActionForm>
      </div>
    </section>
  );
}
