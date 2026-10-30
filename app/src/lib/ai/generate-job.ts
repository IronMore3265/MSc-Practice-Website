import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { JobFatalError, ModelOutputError } from "./errors";
import { generateJson } from "./gemini";
import { GENERATION_SCHEMA, MAX_GENERATE_COUNT, buildPrompt, validateGenerated, type GenKind } from "./generation";

type Db = SupabaseClient<Database>;

export type GeneratePayload = { course_id: string; chapter_id: string; kind: GenKind; count: number; marks: number };

export function parseGeneratePayload(p: unknown): GeneratePayload {
  const o = (p ?? {}) as Record<string, unknown>;
  const count = Number(o.count);
  const marks = Number(o.marks);
  if (typeof o.chapter_id !== "string" || typeof o.course_id !== "string" || (o.kind !== "mcq" && o.kind !== "cq")) {
    throw new JobFatalError("The job is missing its chapter or question type.");
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_GENERATE_COUNT || !Number.isInteger(marks) || marks < 1 || marks > 100) {
    throw new JobFatalError("The job has an invalid count or marks.");
  }
  return { course_id: o.course_id, chapter_id: o.chapter_id, kind: o.kind, count, marks };
}

// Reads the chapter text, asks Gemini for questions, checks them strictly and saves them as drafts for review.
export async function runGenerateJob(args: { db: Db; job: { id: string; user_id: string; payload: unknown }; apiKey: string; model: string }) {
  const { db, job } = args;
  const p = parseGeneratePayload(job.payload);

  const { data: chapter } = await db.from("chapter").select("id, number, title, course_id, course(name)").eq("id", p.chapter_id).maybeSingle();
  if (!chapter || chapter.course_id !== p.course_id) throw new JobFatalError("The chapter no longer exists.");
  const { data: pdf } = await db.from("source_pdf").select("id, page_count").eq("chapter_id", chapter.id).maybeSingle();
  if (!pdf) throw new JobFatalError("This chapter has no imported PDF yet.");

  const [{ data: pages }, { data: figures }, { data: existing }] = await Promise.all([
    db.from("page_text").select("page, text").eq("pdf_id", pdf.id).order("page"),
    db.from("figure").select("id, label, page").eq("chapter_id", chapter.id).order("page"),
    db.from("question").select("text").eq("chapter_id", chapter.id).eq("kind", p.kind).order("created_at", { ascending: false }).limit(500),
  ]);
  if (!pages?.some((pg) => pg.text.trim().length >= 20)) throw new JobFatalError("This chapter has no extracted text.");
  const existingTexts = (existing ?? []).map((q) => q.text);

  const { system, user } = buildPrompt({
    courseName: chapter.course?.name ?? "the course",
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    kind: p.kind,
    count: p.count,
    marks: p.marks,
    pages,
    figures: figures ?? [],
    existing: existingTexts.slice(0, 40),
  });

  const raw = await generateJson({ apiKey: args.apiKey, model: args.model, system, user, schema: GENERATION_SCHEMA });
  const { questions, skipped } = validateGenerated(raw, {
    kind: p.kind,
    marks: p.marks,
    count: p.count,
    pageCount: pdf.page_count,
    figures: figures ?? [],
    existing: existingTexts,
  });
  if (questions.length === 0) throw new ModelOutputError(`Nothing usable came back. ${skipped[0] ?? ""}`.trim());

  const ids: string[] = [];
  for (const q of questions) {
    const { data: row, error } = await db
      .from("question")
      .insert({
        course_id: p.course_id,
        chapter_id: p.chapter_id,
        kind: q.kind,
        text: q.text,
        marks: q.marks,
        origin: "ai",
        status: "draft",
        figure_id: q.figure_id,
        source_page: q.source_page,
        answer_notes: q.answer_notes,
        job_id: job.id,
        created_by: job.user_id,
      })
      .select("id")
      .single();
    if (error || !row) {
      skipped.push(`Could not save a question: ${error?.message ?? "unknown error"}`);
      continue;
    }
    if (q.options.length) {
      const { error: optError } = await db.from("mcq_option").insert(q.options.map((o) => ({ ...o, question_id: row.id })));
      if (optError) {
        await db.from("question").delete().eq("id", row.id);
        skipped.push(`Could not save the options of a question: ${optError.message}`);
        continue;
      }
    }
    ids.push(row.id);
  }
  if (ids.length === 0) throw new ModelOutputError("The questions could not be saved.");

  return { inserted: ids.length, skipped, question_ids: ids, model: args.model } as unknown as Json;
}
