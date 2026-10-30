import Link from "next/link";
import { QuestionEditor } from "@/components/QuestionEditor";
import { createClient } from "@/lib/supabase/server";
import { saveQuestion } from "../actions";

type SearchParams = Promise<{ course?: string; chapter?: string; kind?: string }>;

const KINDS = [
  { value: "mcq", label: "MCQ" },
  { value: "cq", label: "CQ" },
  { value: "problem", label: "Problem" },
] as const;

export default async function NewQuestionPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: courses } = await supabase.from("course").select("id, name, short_name").order("sort_order");
  const { data: chapters } = await supabase.from("chapter").select("id, course_id, number, title").order("number");
  const chapter = (chapters ?? []).find((c) => c.id === sp.chapter);
  const kind = KINDS.find((k) => k.value === sp.kind)?.value;

  if (!chapter || !kind) {
    // Step one: pick the chapter and the type. A plain GET form, so no script is needed.
    const course = (courses ?? []).find((c) => c.id === sp.course) ?? courses?.[0];
    const list = (chapters ?? []).filter((c) => c.course_id === course?.id);
    return (
      <section className="stack" style={{ gap: 22 }}>
        <div className="stack-sm">
          <Link href="/admin/questions" className="label">Back to question bank</Link>
          <h1 className="heading">New question</h1>
        </div>
        <div className="stack-sm">
          <p className="label">Course</p>
          <div className="wrap">
            {(courses ?? []).map((c) => (
              <Link key={c.id} href={`/admin/questions/new?course=${c.id}`} className="pill" aria-current={c.id === course?.id ? "page" : undefined}>
                {c.short_name ?? c.name}
              </Link>
            ))}
          </div>
        </div>
        <form method="get" className="inline-form card-shadow">
          <input type="hidden" name="course" value={course?.id ?? ""} />
          <div className="field" style={{ width: 260 }}>
            <label className="label" htmlFor="pick-chapter">Chapter</label>
            <select id="pick-chapter" name="chapter" className="select input-sm" defaultValue={sp.chapter ?? list[0]?.id} required>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  Ch {c.number} {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 140 }}>
            <label className="label" htmlFor="pick-kind">Type</label>
            <select id="pick-kind" name="kind" className="select input-sm" defaultValue="mcq">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={list.length === 0}>Continue</button>
        </form>
      </section>
    );
  }

  const { data: figures } = await supabase.from("figure").select("id, label, page").eq("chapter_id", chapter.id).order("page");
  const course = (courses ?? []).find((c) => c.id === chapter.course_id);

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <Link href="/admin/questions/new" className="label">Back</Link>
        <h1 className="heading">
          New <span className="accent">{KINDS.find((k) => k.value === kind)?.label}</span>
        </h1>
        <p className="small muted">
          {course?.short_name ?? course?.name} · Ch {chapter.number} {chapter.title}
        </p>
      </div>
      <QuestionEditor
        action={saveQuestion}
        kind={kind}
        courseId={chapter.course_id}
        chapterId={chapter.id}
        figures={figures ?? []}
        defaultMarks={kind === "mcq" ? 1 : 5}
      />
    </section>
  );
}
