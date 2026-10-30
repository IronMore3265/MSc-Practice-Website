import Link from "@/components/NavLink";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { addToSet, deleteSet, moveInSet, removeFromSet, renameSet } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND_LABEL = { mcq: "MCQ", cq: "CQ", problem: "Problem" } as const;
const CANDIDATE_LIMIT = 60;

export default async function SetEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; chapter?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const { data: set } = await supabase
    .from("question_set")
    .select("*, exam(id, name, course_id, exam_set_settings(*), exam_chapter(chapter_id))")
    .eq("id", id)
    .maybeSingle();
  if (!set || !set.exam) notFound();
  const exam = set.exam;

  const { data: items } = await supabase
    .from("question_set_item")
    .select("position, question(id, kind, text, marks, chapter_id, source_page)")
    .eq("set_id", id)
    .order("position");
  const rows = (items ?? []).flatMap((i) => (i.question ? [i.question] : []));
  const inSet = new Set(rows.map((q) => q.id));

  const chapterIds = exam.exam_chapter.map((c) => c.chapter_id);
  const { data: chapters } = chapterIds.length ? await supabase.from("chapter").select("id, number").in("id", chapterIds).order("number") : { data: [] };
  const number = new Map((chapters ?? []).map((c) => [c.id, c.number]));

  const kind = sp.kind === "mcq" || sp.kind === "cq" || sp.kind === "problem" ? sp.kind : undefined;
  const chapterFilter = (chapters ?? []).find((c) => c.id === sp.chapter)?.id;
  let candidates: { id: string; kind: keyof typeof KIND_LABEL; text: string; chapter_id: string }[] = [];
  if (chapterIds.length) {
    let q = supabase
      .from("question")
      .select("id, kind, text, chapter_id")
      .eq("status", "approved")
      .in("chapter_id", chapterFilter ? [chapterFilter] : chapterIds)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT + rows.length);
    if (kind) q = q.eq("kind", kind);
    candidates = ((await q).data ?? []).filter((c) => !inSet.has(c.id)).slice(0, CANDIDATE_LIMIT);
  }

  const mcq = rows.filter((q) => q.kind === "mcq").length;
  const s = exam.exam_set_settings;
  const base = `/admin/sets/${id}`;
  const link = (p: Record<string, string | undefined>) => {
    const q = Object.entries({ kind, chapter: chapterFilter, ...p }).filter(([, v]) => v);
    return q.length ? `${base}?${q.map(([k, v]) => `${k}=${v}`).join("&")}` : base;
  };

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <Link href={`/admin/sets?course=${exam.course_id}&exam=${exam.id}`} className="label">Back to sets</Link>
        <h1 className="heading">
          {exam.name} <span className="accent">{set.name}</span>
        </h1>
        <p className="small muted">
          {mcq} MCQ and {rows.length - mcq} CQ in this set. Target {s?.mcq_count ?? 0} MCQ and {s?.cq_count ?? 0} CQ. {set.origin === "auto" ? "Built randomly, you can still edit it." : "Hand-picked."}
        </p>
      </div>

      <div className="wrap" style={{ gap: 18, alignItems: "flex-end" }}>
        <ActionForm action={renameSet} submitLabel="Rename" buttonClass="btn btn-small" className="inline-form">
          <input type="hidden" name="id" value={set.id} />
          <div className="field" style={{ width: 160 }}>
            <label className="label" htmlFor="set-name">Name</label>
            <input id="set-name" name="name" className="input input-sm" defaultValue={set.name} required />
          </div>
        </ActionForm>
        <ActionForm action={deleteSet} submitLabel="Delete set" buttonClass="btn btn-small" confirmText={`Delete ${set.name}? Student history keeps its scores.`}>
          <input type="hidden" name="id" value={set.id} />
        </ActionForm>
      </div>

      <div className="stack-sm">
        <p className="label">Questions in this set</p>
        <div className="card rows">
          {rows.map((q, i) => (
            <div key={q.id} className="student">
              <div className="wrap">
                <span className="row-name">{i + 1}.</span>
                <span className="chip">{KIND_LABEL[q.kind]}</span>
                <span className="small muted">Ch {number.get(q.chapter_id) ?? "?"} · {q.marks} mark{q.marks === 1 ? "" : "s"}</span>
              </div>
              <p>{q.text}</p>
              <div className="wrap">
                <ActionForm action={moveInSet} submitLabel="Up" buttonClass="btn btn-small" className="wrap">
                  <input type="hidden" name="set_id" value={set.id} />
                  <input type="hidden" name="question_id" value={q.id} />
                  <input type="hidden" name="dir" value="up" />
                </ActionForm>
                <ActionForm action={moveInSet} submitLabel="Down" buttonClass="btn btn-small" className="wrap">
                  <input type="hidden" name="set_id" value={set.id} />
                  <input type="hidden" name="question_id" value={q.id} />
                  <input type="hidden" name="dir" value="down" />
                </ActionForm>
                <ActionForm action={removeFromSet} submitLabel="Remove" buttonClass="btn btn-small" className="wrap">
                  <input type="hidden" name="set_id" value={set.id} />
                  <input type="hidden" name="question_id" value={q.id} />
                </ActionForm>
              </div>
            </div>
          ))}
          {rows.length === 0 ? <p className="small muted">This set is empty. Add questions below.</p> : null}
        </div>
      </div>

      <div className="stack-sm">
        <p className="label">Add approved questions</p>
        <div className="wrap" style={{ gap: 18 }}>
          <div className="wrap">
            <span className="label">Type</span>
            {[undefined, "mcq", "cq", "problem"].map((k) => (
              <Link key={k ?? "all"} href={link({ kind: k })} className="pill" aria-current={kind === k ? "page" : undefined}>
                {k ? KIND_LABEL[k as keyof typeof KIND_LABEL] : "All"}
              </Link>
            ))}
          </div>
          <div className="wrap">
            <span className="label">Chapter</span>
            <Link href={link({ chapter: undefined })} className="pill" aria-current={!chapterFilter ? "page" : undefined}>All</Link>
            {(chapters ?? []).map((c) => (
              <Link key={c.id} href={link({ chapter: c.id })} className="pill" aria-current={chapterFilter === c.id ? "page" : undefined}>
                {c.number}
              </Link>
            ))}
          </div>
        </div>
        <div className="card rows">
          {candidates.map((q) => (
            <div key={q.id} className="student">
              <div className="wrap">
                <span className="chip">{KIND_LABEL[q.kind]}</span>
                <span className="small muted">Ch {number.get(q.chapter_id) ?? "?"}</span>
              </div>
              <p>{q.text}</p>
              <ActionForm action={addToSet} submitLabel="Add to set" buttonClass="btn btn-small btn-primary" className="wrap">
                <input type="hidden" name="set_id" value={set.id} />
                <input type="hidden" name="question_id" value={q.id} />
              </ActionForm>
            </div>
          ))}
          {candidates.length === 0 ? (
            <p className="small muted">
              {chapterIds.length === 0 ? "This exam has no chapters yet." : "No more approved questions match. Approve drafts in the question bank."}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
