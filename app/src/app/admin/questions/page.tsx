import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { JobWatcher } from "@/components/JobWatcher";
import { MAX_GENERATE_COUNT } from "@/lib/ai/generation";
import { createClient } from "@/lib/supabase/server";
import { deleteQuestion, generateQuestions, retryJob, setQuestionStatus } from "./actions";

type SearchParams = Promise<{ course?: string; chapter?: string; kind?: string; status?: string; job?: string }>;

const KIND_LABEL = { mcq: "MCQ", cq: "CQ", problem: "Problem" } as const;
const LIMIT = 100;

function href(p: Record<string, string | undefined>) {
  const q = Object.entries(p).filter(([, v]) => v);
  return `/admin/questions${q.length ? "?" + q.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&") : ""}`;
}

export default async function QuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: courses } = await supabase.from("course").select("*").order("sort_order");
  const course = (courses ?? []).find((c) => c.id === sp.course) ?? courses?.[0];
  if (!course) return <p className="small muted">No courses yet. Add one on the Exams tab.</p>;

  const { data: chapters } = await supabase.from("chapter").select("id, number, title, source_pdf(id)").eq("course_id", course.id).order("number");
  const chapter = (chapters ?? []).find((c) => c.id === sp.chapter);
  const kind = sp.kind === "mcq" || sp.kind === "cq" || sp.kind === "problem" ? sp.kind : undefined;
  const status = sp.status === "draft" || sp.status === "approved" ? sp.status : undefined;
  const jobFilter = /^[0-9a-f-]{36}$/i.test(sp.job ?? "") ? sp.job : undefined;

  let query = supabase
    .from("question")
    .select("*, chapter(number), mcq_option(label, text, is_correct, explanation)")
    .eq("course_id", course.id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (chapter) query = query.eq("chapter_id", chapter.id);
  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  if (jobFilter) query = query.eq("job_id", jobFilter);
  const { data: questions } = await query;

  const { data: jobs } = await supabase
    .from("job")
    .select("id, status, payload, error, result, created_at")
    .eq("kind", "generate")
    .order("created_at", { ascending: false })
    .limit(6);
  const active = (jobs ?? []).filter((j) => j.status === "queued" || j.status === "running").map((j) => j.id);

  const chapterNumber = new Map((chapters ?? []).map((c) => [c.id, c.number]));
  const base = { course: course.id, chapter: chapter?.id, kind, status, job: jobFilter };
  const importable = (chapters ?? []).filter((c) => c.source_pdf);

  return (
    <section className="stack" style={{ gap: 22 }}>
      <JobWatcher jobIds={active} />
      <div className="between">
        <h1 className="heading">
          Question bank <span className="accent">{(questions ?? []).length}</span>
        </h1>
        <Link href={`/admin/questions/new?course=${course.id}${chapter ? `&chapter=${chapter.id}` : ""}`} className="btn btn-primary btn-small">
          + New question
        </Link>
      </div>

      <div className="stack-sm">
        <p className="label">Course</p>
        <div className="wrap">
          {(courses ?? []).map((c) => (
            <Link key={c.id} href={href({ course: c.id })} className="pill" aria-current={c.id === course.id ? "page" : undefined}>
              {c.short_name ?? c.name}
            </Link>
          ))}
        </div>
        <p className="label">Chapter</p>
        <div className="wrap">
          <Link href={href({ ...base, chapter: undefined })} className="pill" aria-current={!chapter ? "page" : undefined}>
            All
          </Link>
          {(chapters ?? []).map((c) => (
            <Link key={c.id} href={href({ ...base, chapter: c.id })} className="pill" aria-current={chapter?.id === c.id ? "page" : undefined}>
              {c.number}
            </Link>
          ))}
        </div>
        <div className="wrap" style={{ gap: 20 }}>
          <div className="wrap">
            <span className="label">Type</span>
            {[undefined, "mcq", "cq", "problem"].map((k) => (
              <Link key={k ?? "all"} href={href({ ...base, kind: k })} className="pill" aria-current={kind === k ? "page" : undefined}>
                {k ? KIND_LABEL[k as keyof typeof KIND_LABEL] : "All"}
              </Link>
            ))}
          </div>
          <div className="wrap">
            <span className="label">Status</span>
            {[undefined, "draft", "approved"].map((s) => (
              <Link key={s ?? "all"} href={href({ ...base, status: s })} className="pill" aria-current={status === s ? "page" : undefined}>
                {s ? s[0].toUpperCase() + s.slice(1) : "All"}
              </Link>
            ))}
          </div>
        </div>
        {jobFilter ? (
          <p className="small">
            Showing one generation job. <Link href={href({ ...base, job: undefined })} className="btn-link">Show all</Link>
          </p>
        ) : null}
      </div>

      <details className="card stack-sm" open={active.length > 0}>
        <summary className="label" style={{ cursor: "pointer" }}>Generate questions with AI</summary>
        {importable.length === 0 ? (
          <p className="small muted">No chapter of this course has an imported PDF yet. Import one with the import tool first.</p>
        ) : (
          <ActionForm action={generateQuestions} submitLabel="Generate" buttonClass="btn btn-primary" className="inline-form">
            <div className="field" style={{ width: 240 }}>
              <label className="label" htmlFor="gen-chapter">Chapter</label>
              <select id="gen-chapter" name="chapter_id" className="select input-sm" defaultValue={chapter?.id ?? importable[0].id}>
                {importable.map((c) => (
                  <option key={c.id} value={c.id}>
                    Ch {c.number} {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 130 }}>
              <label className="label" htmlFor="gen-kind">Type</label>
              <select id="gen-kind" name="kind" className="select input-sm" defaultValue="mcq">
                <option value="mcq">MCQ</option>
                <option value="cq">CQ</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="gen-count">How many</label>
              <input id="gen-count" name="count" inputMode="numeric" className="input input-sm" defaultValue="5" />
            </div>
            <div className="field">
              <label className="label" htmlFor="gen-marks">CQ marks each</label>
              <input id="gen-marks" name="marks" inputMode="numeric" className="input input-sm" defaultValue="5" />
            </div>
          </ActionForm>
        )}
        <p className="small muted">
          Up to {MAX_GENERATE_COUNT} per run. New questions arrive as drafts with the page they came from. Read each one, edit if needed, then approve.
        </p>
        {(jobs ?? []).length > 0 ? (
          <div className="rows">
            {(jobs ?? []).map((j) => {
              const p = j.payload as { kind?: string; count?: number; chapter_id?: string };
              const inserted = (j.result as { inserted?: number } | null)?.inserted;
              return (
                <div key={j.id} className="row">
                  <span className="small">
                    {p.count} {p.kind === "cq" ? "CQ" : "MCQ"}, Ch {chapterNumber.get(p.chapter_id ?? "") ?? "?"}
                    {j.status === "done" ? (
                      <>
                        {" "}
                        · <Link href={href({ course: course.id, job: j.id })} className="btn-link">{inserted ?? 0} drafts</Link>
                      </>
                    ) : null}
                    {j.error ? <span className="muted" style={{ display: "block" }}>{j.error}</span> : null}
                  </span>
                  <span className="wrap">
                    <span className={`chip ${j.status === "done" ? "chip-done" : j.status === "failed" ? "chip-muted" : "chip-now"}`}>{j.status}</span>
                    {j.status === "failed" ? (
                      <ActionForm action={retryJob} submitLabel="Retry" buttonClass="btn btn-small">
                        <input type="hidden" name="id" value={j.id} />
                      </ActionForm>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </details>

      <div className="card rows">
        {(questions ?? []).map((q) => {
          const options = [...q.mcq_option].sort((a, b) => a.label.localeCompare(b.label));
          return (
            <div key={q.id} className="student">
              <div className="wrap">
                <span className="chip">{KIND_LABEL[q.kind]}</span>
                {q.origin === "ai" ? <span className="chip chip-now">AI</span> : null}
                <span className={`chip ${q.status === "approved" ? "chip-done" : "chip-muted"}`}>{q.status}</span>
                <span className="small muted">
                  Ch {chapterNumber.get(q.chapter_id) ?? "?"}
                  {q.source_page ? ` · p.${q.source_page}` : ""} · {q.marks} mark{q.marks === 1 ? "" : "s"}
                </span>
              </div>
              <p>{q.text}</p>
              {options.length > 0 || q.answer_notes ? (
                <details>
                  <summary className="label" style={{ cursor: "pointer" }}>{options.length ? "Options and answer" : "Key points"}</summary>
                  <div className="stack-sm" style={{ marginTop: 8 }}>
                    {options.map((o) => (
                      <p key={o.label} className="small">
                        <span className="row-name">{o.label}.</span> {o.text} {o.is_correct ? <span className="chip chip-done">Correct</span> : null}
                        {o.explanation ? <span className="muted" style={{ display: "block" }}>{o.explanation}</span> : null}
                      </p>
                    ))}
                    {q.answer_notes ? <p className="small" style={{ whiteSpace: "pre-line" }}>{q.answer_notes}</p> : null}
                  </div>
                </details>
              ) : null}
              <div className="wrap">
                <Link href={`/admin/questions/${q.id}`} className="btn btn-small">Edit</Link>
                {q.status === "draft" ? (
                  <ActionForm action={setQuestionStatus} submitLabel="Approve" buttonClass="btn btn-small btn-primary" className="wrap">
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="to" value="approved" />
                  </ActionForm>
                ) : (
                  <ActionForm action={setQuestionStatus} submitLabel="Back to draft" buttonClass="btn btn-small" className="wrap">
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="to" value="draft" />
                  </ActionForm>
                )}
                <ActionForm action={deleteQuestion} submitLabel="Delete" buttonClass="btn btn-small" className="wrap" confirmText="Delete this question? It is also removed from any set.">
                  <input type="hidden" name="id" value={q.id} />
                </ActionForm>
              </div>
            </div>
          );
        })}
        {(questions ?? []).length === 0 ? <p className="small muted">No questions match. Add one, or generate some from a chapter.</p> : null}
      </div>
      {(questions ?? []).length === LIMIT ? <p className="small muted">Showing the newest {LIMIT}. Use the filters to narrow down.</p> : null}
    </section>
  );
}
