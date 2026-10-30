import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { JobFatalError } from "./errors";
import { generateJson, type InlineImage } from "./gemini";
import { GRADE_SCHEMA, buildGradePrompt, validateGrade } from "./grading";
import { purgeAttemptPhotos } from "./photos";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 6_000_000;

// The question's figure, as the original bytes from storage. Skipped when it is too big, the label is still in the prompt.
async function loadFigure(db: Db, figureId: string | null): Promise<{ image: InlineImage | null; label: string | null; page: number } | null> {
  if (!figureId) return null;
  const { data: figure } = await db.from("figure").select("blob_path, mime_type, label, page").eq("id", figureId).maybeSingle();
  if (!figure) return null;
  const { data: file } = await db.storage.from("figures").download(figure.blob_path);
  let image: InlineImage | null = null;
  if (file && file.size <= MAX_IMAGE_BYTES) {
    image = { mimeType: figure.mime_type, data: Buffer.from(await file.arrayBuffer()).toString("base64") };
  }
  return { image, label: figure.label, page: figure.page };
}

// Grades one typed answer: reads the answer and the question from the database (never trusting the job payload for
// the answer text), asks Gemini, checks the grade strictly and saves it. Called only by the router.
export async function runGradeJob(args: { db: Db; job: { id: string; user_id: string; payload: unknown }; apiKey: string; model: string }) {
  const { db, job } = args;
  const attemptId = (job.payload as { attempt_id?: unknown } | null)?.attempt_id;
  if (typeof attemptId !== "string" || !UUID.test(attemptId)) throw new JobFatalError("The job has no answer to grade.");

  const { data: attempt } = await db
    .from("attempt")
    .select("id, user_id, answer_text, question_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== job.user_id) throw new JobFatalError("The answer no longer exists.");
  if (!attempt.answer_text?.trim()) throw new JobFatalError("The answer is empty.");

  const { data: question } = await db
    .from("question")
    .select("id, text, marks, kind, answer_notes, figure_id, chapter_id, chapter(id, number, title, course(name))")
    .eq("id", attempt.question_id)
    .maybeSingle();
  if (!question || question.kind !== "cq") throw new JobFatalError("The question no longer exists.");
  const chapter = question.chapter;
  if (!chapter) throw new JobFatalError("The chapter no longer exists.");

  const { data: pdf } = await db.from("source_pdf").select("id, page_count").eq("chapter_id", chapter.id).maybeSingle();
  if (!pdf) throw new JobFatalError("This chapter has no imported PDF, so the answer cannot be marked.");

  const [{ data: pages }, { data: figures }, figure] = await Promise.all([
    db.from("page_text").select("page, text").eq("pdf_id", pdf.id).order("page"),
    db.from("figure").select("id, label, page").eq("chapter_id", chapter.id).order("page"),
    loadFigure(db, question.figure_id),
  ]);
  if (!pages?.some((pg) => pg.text.trim().length >= 20)) throw new JobFatalError("This chapter has no extracted text.");

  const { system, user } = buildGradePrompt({
    courseName: chapter.course?.name ?? "the course",
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    question: question.text,
    marks: question.marks,
    keyPoints: question.answer_notes,
    figure: figure ? { label: figure.label, page: figure.page } : null,
    answer: attempt.answer_text,
    pages,
    figures: figures ?? [],
  });

  const raw = await generateJson({
    apiKey: args.apiKey,
    model: args.model,
    system,
    user,
    schema: GRADE_SCHEMA,
    images: figure?.image ? [figure.image] : undefined,
    temperature: 0.2,
  });
  const feedback = validateGrade(raw, { marks: question.marks, pageCount: pdf.page_count, figures: figures ?? [], answer: attempt.answer_text });

  const { error } = await db.rpc("record_cq_grade", { p_attempt: attempt.id, p_score: feedback.score, p_feedback: feedback as unknown as Json });
  if (error) throw new Error(`Could not save the grade: ${error.message}`);

  // The answer is marked, so the photos have done their job and only the text stays. A failure here must not fail
  // the job (the grade is saved), the daily cleanup deletes whatever is left.
  await purgeAttemptPhotos(db, attempt.id).catch(() => undefined);

  return { attempt_id: attempt.id, score: feedback.score, out_of: feedback.out_of, model: args.model } as unknown as Json;
}
