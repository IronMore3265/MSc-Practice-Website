"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { ActionState } from "@/lib/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Set builder. Hand edits run as the signed-in admin (row level security applies). New random sets are built
// by a database function that only the server can call.

const done = (message: string): ActionState => ({ ok: true, message });
const bad = (message: string): ActionState => ({ ok: false, message });

function text(form: FormData, key: string, max = 80) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

export async function createAutoSet(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await requireAdmin();
  const examId = text(form, "exam_id", 40);
  // Empty means a whole-exam set. A chapter id makes a set for that chapter only.
  const chapterId = text(form, "chapter_id", 40) || undefined;
  const { data, error } = await createAdminClient().rpc("create_auto_set", { p_exam_id: examId, p_user: profile.id, p_chapter_id: chapterId });
  if (error) {
    if (error.message.includes("no_questions")) return bad(chapterId ? "No approved questions in this chapter yet." : "No approved questions in this exam's chapters yet. Approve some in the question bank first.");
    if (error.message.includes("too_many_sets")) return bad("This exam already has 50 sets. Delete some first.");
    return bad("Could not build a set.");
  }
  revalidatePath("/admin/sets");
  redirect(`/admin/sets/${data}`);
}

export async function createEmptySet(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await requireAdmin();
  const examId = text(form, "exam_id", 40);
  const chapterId = text(form, "chapter_id", 40) || null;
  const supabase = await createClient();
  let prefix = "Set ";
  if (chapterId) {
    const { data: link } = await supabase.from("exam_chapter").select("chapter(number)").eq("exam_id", examId).eq("chapter_id", chapterId).maybeSingle();
    if (!link?.chapter) return bad("That chapter is not part of this exam.");
    prefix = `Ch ${link.chapter.number} Set `;
  }
  const { data: existing } = await supabase.from("question_set").select("name").eq("exam_id", examId);
  const used = (existing ?? []).map((s) => (s.name.startsWith(prefix) && /^\d+$/.test(s.name.slice(prefix.length)) ? Number(s.name.slice(prefix.length)) : 0));
  const name = `${prefix}${Math.max(0, ...used) + 1}`;
  const { data, error } = await supabase.from("question_set").insert({ exam_id: examId, chapter_id: chapterId, name, origin: "curated", created_by: profile.id }).select("id").single();
  if (error || !data) return bad("Could not create the set.");
  revalidatePath("/admin/sets");
  redirect(`/admin/sets/${data.id}`);
}

export async function renameSet(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const name = text(form, "name", 60);
  if (!name) return bad("Enter a name.");
  const supabase = await createClient();
  const { error } = await supabase.from("question_set").update({ name }).eq("id", id);
  if (error) return bad(error.code === "23505" ? "Another set of this exam has that name." : "Could not rename the set.");
  revalidatePath("/admin/sets");
  return done("Renamed.");
}

export async function deleteSet(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: set } = await supabase.from("question_set").select("exam_id").eq("id", text(form, "id", 40)).maybeSingle();
  const { error } = await supabase.from("question_set").delete().eq("id", text(form, "id", 40));
  if (error) return bad("Could not delete the set.");
  revalidatePath("/admin/sets");
  redirect(`/admin/sets${set ? `?exam=${set.exam_id}` : ""}`);
}

export async function addToSet(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const setId = text(form, "set_id", 40);
  const questionId = text(form, "question_id", 40);
  const supabase = await createClient();

  const { data: set } = await supabase.from("question_set").select("exam_id").eq("id", setId).maybeSingle();
  const { data: question } = await supabase.from("question").select("chapter_id, status").eq("id", questionId).maybeSingle();
  if (!set || !question) return bad("That set or question no longer exists.");
  if (question.status !== "approved") return bad("Only approved questions can go into a set.");
  const { data: link } = await supabase.from("exam_chapter").select("exam_id").eq("exam_id", set.exam_id).eq("chapter_id", question.chapter_id).maybeSingle();
  if (!link) return bad("That question is not from one of this exam's chapters.");

  const { data: last } = await supabase.from("question_set_item").select("position").eq("set_id", setId).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("question_set_item").insert({ set_id: setId, question_id: questionId, position: (last?.[0]?.position ?? -1) + 1 });
  if (error) return bad(error.code === "23505" ? "Already in this set." : "Could not add the question.");
  revalidatePath(`/admin/sets/${setId}`);
  return done("Added.");
}

export async function removeFromSet(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const setId = text(form, "set_id", 40);
  const supabase = await createClient();
  const { error } = await supabase.from("question_set_item").delete().eq("set_id", setId).eq("question_id", text(form, "question_id", 40));
  if (error) return bad("Could not remove the question.");
  revalidatePath(`/admin/sets/${setId}`);
  return done("Removed.");
}

// Moves a question one place up or down by renumbering the whole set 0, 1, 2 ...
export async function moveInSet(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const setId = text(form, "set_id", 40);
  const questionId = text(form, "question_id", 40);
  const dir = text(form, "dir", 4) === "up" ? -1 : 1;
  const supabase = await createClient();

  const { data: items } = await supabase.from("question_set_item").select("question_id, position").eq("set_id", setId).order("position").order("question_id");
  const order = (items ?? []).map((i) => i.question_id);
  const from = order.indexOf(questionId);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= order.length) return done("Already at the end.");
  [order[from], order[to]] = [order[to], order[from]];

  for (const [position, qid] of order.entries()) {
    const was = (items ?? []).find((i) => i.question_id === qid)?.position;
    if (was === position) continue;
    const { error } = await supabase.from("question_set_item").update({ position }).eq("set_id", setId).eq("question_id", qid);
    if (error) return bad("Could not reorder the set.");
  }
  revalidatePath(`/admin/sets/${setId}`);
  return done("Moved.");
}
