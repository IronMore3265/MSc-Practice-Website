import Link from "@/components/NavLink";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { QuestionEditor } from "@/components/QuestionEditor";
import { createClient } from "@/lib/supabase/server";
import { deleteQuestion, saveQuestion } from "../actions";

const KIND_LABEL = { mcq: "MCQ", cq: "CQ", problem: "Problem" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("question")
    .select("*, chapter(number, title), mcq_option(label, text, is_correct, explanation)")
    .eq("id", id)
    .maybeSingle();
  if (!question) notFound();

  const { data: figures } = await supabase.from("figure").select("id, label, page").eq("chapter_id", question.chapter_id).order("page");
  const options = [...question.mcq_option].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <Link href={`/admin/questions?course=${question.course_id}&chapter=${question.chapter_id}`} className="label">Back to question bank</Link>
        <h1 className="heading">
          Edit <span className="accent">{KIND_LABEL[question.kind]}</span>
        </h1>
        <p className="small muted">
          Ch {question.chapter?.number} {question.chapter?.title}
          {question.origin === "ai" ? " · written by AI, check it against the notes" : ""}
        </p>
        {created ? <p className="form-msg" data-ok="true">Created as a draft.</p> : null}
      </div>

      <div className="card-shadow">
        <QuestionEditor
          key={question.updated_at}
          action={saveQuestion}
          kind={question.kind}
          courseId={question.course_id}
          chapterId={question.chapter_id}
          figures={figures ?? []}
          question={question}
          options={options}
          defaultMarks={1}
        />
      </div>

      <ActionForm action={deleteQuestion} submitLabel="Delete question" buttonClass="btn btn-small" confirmText="Delete this question? It is also removed from any set.">
        <input type="hidden" name="id" value={question.id} />
        <input type="hidden" name="go_back" value="1" />
      </ActionForm>
    </section>
  );
}
