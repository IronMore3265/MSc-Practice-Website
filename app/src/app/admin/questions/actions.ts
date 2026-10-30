"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { MAX_GENERATE_COUNT } from "@/lib/ai/generation";
import { runTick } from "@/lib/ai/router";
import type { ActionState } from "@/lib/action-state";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Question bank edits. They run as the signed-in admin (anon key plus session), so row level security
// is a second gate behind requireAdmin(). Generation goes through the job queue and the request router.

const done = (message: string): ActionState => ({ ok: true, message });
const bad = (message: string): ActionState => ({ ok: false, message });

function text(form: FormData, key: string, max = 4000) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function whole(form: FormData, key: string, min: number, max: number): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

const KINDS = ["mcq", "cq", "problem"] as const;
const LABELS = ["A", "B", "C", "D"] as const;

export async function saveQuestion(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const kind = text(form, "kind", 10) as (typeof KINDS)[number];
  const courseId = text(form, "course_id", 40);
  const chapterId = text(form, "chapter_id", 40);
  const body = text(form, "text");
  const marks = whole(form, "marks", 1, 100);
  const pageRaw = text(form, "source_page", 6);
  const figureId = text(form, "figure_id", 40);
  const notes = text(form, "answer_notes");
  const approve = text(form, "intent", 10) === "approve";

  if (!KINDS.includes(kind) || !courseId || !chapterId) return bad("This question is missing its type or chapter.");
  if (body.length < 5) return bad("Write the question text.");
  if (marks === null) return bad("Marks must be a whole number from 1 to 100.");
  if (pageRaw && !/^\d{1,4}$/.test(pageRaw)) return bad("Source page must be a page number.");
  if (pageRaw && Number(pageRaw) < 1) return bad("Source page must be a page number.");

  const supabase = await createClient();

  if (figureId) {
    const { data: figure } = await supabase.from("figure").select("id").eq("id", figureId).eq("chapter_id", chapterId).maybeSingle();
    if (!figure) return bad("That figure does not belong to this chapter.");
  }

  let options: Json = [];
  if (kind === "mcq") {
    const correct = text(form, "correct", 1);
    if (!LABELS.includes(correct as (typeof LABELS)[number])) return bad("Mark which option is correct.");
    const list = LABELS.map((label) => ({
      label,
      text: text(form, `opt_${label}`, 1000),
      is_correct: label === correct,
      explanation: text(form, `exp_${label}`, 2000),
    }));
    if (list.some((o) => !o.text)) return bad("Fill in all four options.");
    if (new Set(list.map((o) => o.text.toLowerCase())).size !== 4) return bad("Two options are the same.");
    options = list;
  }

  const { data, error } = await supabase.rpc("save_question", {
    p_question: {
      id: id || null,
      course_id: courseId,
      chapter_id: chapterId,
      kind,
      text: body,
      marks,
      figure_id: figureId || null,
      source_page: pageRaw || null,
      answer_notes: kind === "mcq" ? null : notes || null,
      status: approve ? "approved" : "draft",
    },
    p_options: options,
  });
  if (error || !data) {
    if (error?.message.includes("approved MCQ")) return bad("An approved MCQ needs four options and exactly one correct answer.");
    return bad("Could not save the question.");
  }

  revalidatePath("/admin/questions");
  if (!id) redirect(`/admin/questions/${data}?created=1`);
  return done(approve ? "Saved and approved." : "Saved as a draft.");
}

export async function setQuestionStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const to = text(form, "to", 10);
  if (to !== "approved" && to !== "draft") return bad("Unknown status.");
  const supabase = await createClient();
  const { error } = await supabase.from("question").update({ status: to, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    return bad(error.message.includes("approved MCQ") ? "Needs four options and exactly one correct answer first." : "Could not change the status.");
  }
  revalidatePath("/admin/questions");
  return done(to === "approved" ? "Approved." : "Moved back to draft.");
}

export async function deleteQuestion(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const supabase = await createClient();
  const { error } = await supabase.from("question").delete().eq("id", id);
  if (error) return bad("Could not delete the question.");
  revalidatePath("/admin/questions");
  if (text(form, "go_back", 5)) redirect("/admin/questions");
  return done("Deleted.");
}

// Students flag questions with "Report question". After fixing (or ignoring) one, the admin clears its flags.
export async function clearReports(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const supabase = await createClient();
  const { error } = await supabase.from("question_report").delete().eq("question_id", id);
  if (error) return bad("Could not clear the reports.");
  revalidatePath("/admin/questions");
  return done("Cleared.");
}

// Queues question generation. The job runs through the router (Gemini keys, models and pacing come from configuration).
export async function generateQuestions(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await requireAdmin();
  const chapterId = text(form, "chapter_id", 40);
  const kind = text(form, "kind", 10);
  const count = whole(form, "count", 1, MAX_GENERATE_COUNT);
  const marksEach = whole(form, "marks", 1, 100);
  if (!chapterId) return bad("Pick a chapter.");
  if (kind !== "mcq" && kind !== "cq") return bad("Pick MCQ or CQ.");
  if (count === null) return bad(`Count must be from 1 to ${MAX_GENERATE_COUNT}.`);
  if (kind === "cq" && marksEach === null) return bad("Marks must be a whole number.");

  const db = createAdminClient();
  const { data: chapter } = await db.from("chapter").select("id, course_id, source_pdf(id)").eq("id", chapterId).maybeSingle();
  if (!chapter) return bad("That chapter no longer exists.");
  if (!chapter.source_pdf) return bad("Import this chapter's PDF first. Questions are written from its text.");

  const { count: waiting } = await db
    .from("job")
    .select("id", { count: "exact", head: true })
    .eq("kind", "generate")
    .in("status", ["queued", "running"]);
  if ((waiting ?? 0) >= 6) return bad("Six generation jobs are already waiting. Let them finish first.");

  const { error } = await db.from("job").insert({
    user_id: profile.id,
    kind: "generate",
    priority: 100,
    payload: { course_id: chapter.course_id, chapter_id: chapter.id, kind, count, marks: kind === "mcq" ? 1 : marksEach! },
  });
  if (error) return bad("Could not queue the job.");

  after(async () => {
    await runTick();
  });
  revalidatePath("/admin/questions");
  return done("Queued. It will run in the background, the list updates when it is done.");
}

export async function retryJob(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const db = createAdminClient();
  const { error } = await db
    .from("job")
    .update({ status: "queued", attempts: 0, error: null, finished_at: null, slot_id: null })
    .eq("id", id)
    .eq("status", "failed");
  if (error) return bad("Could not retry the job.");
  after(async () => {
    await runTick();
  });
  revalidatePath("/admin/questions");
  revalidatePath("/admin/ai");
  return done("Queued again.");
}
