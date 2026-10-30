"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import type { ExamFormat } from "@/lib/database.types";

// Course and exam edits. These run as the signed-in admin (anon key plus session), so the
// row level security policies are a second gate behind requireAdmin().

const FORMATS: ExamFormat[] = ["mcq", "cq", "both"];

function text(form: FormData, key: string, max = 120) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function int(form: FormData, key: string, min: number, max: number): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

function num(form: FormData, key: string, min: number, max: number): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "" || Number.isNaN(Number(raw))) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

const done = (message: string): ActionState => ({ ok: true, message });
const bad = (message: string): ActionState => ({ ok: false, message });

export async function addSemester(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = text(form, "name", 60);
  if (!name) return bad("Enter a semester name.");

  const supabase = await createClient();
  const { data: last } = await supabase.from("semester").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("semester").insert({ name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error) return bad(error.code === "23505" ? "A semester with that name already exists." : "Could not add the semester.");
  revalidatePath("/admin");
  revalidatePath("/");
  return done("Semester added.");
}

// Hide a finished semester from the student home screen, or open it again.
export async function setSemesterOpen(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 64);
  const open = form.get("open") === "true";
  if (!id) return bad("Pick a semester.");

  const supabase = await createClient();
  const { error } = await supabase.from("semester").update({ is_open: open }).eq("id", id);
  if (error) return bad("Could not change the semester.");
  revalidatePath("/admin");
  revalidatePath("/");
  return done(open ? "Students can see this semester." : "Hidden from students.");
}

export async function addCourse(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = text(form, "name");
  const shortName = text(form, "short_name", 40) || null;
  const semesterId = text(form, "semester_id", 64);
  if (!name) return bad("Enter a course name.");
  if (!semesterId) return bad("Add a semester first.");

  const supabase = await createClient();
  const { count } = await supabase.from("course").select("id", { count: "exact", head: true }).eq("semester_id", semesterId);
  const { error } = await supabase.from("course").insert({ name, short_name: shortName, semester_id: semesterId, sort_order: (count ?? 0) + 1 });
  if (error) return bad(error.code === "23505" ? "A course with that name already exists." : "Could not add the course.");
  revalidatePath("/admin");
  revalidatePath("/");
  return done("Course added.");
}

export async function addChapter(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const courseId = text(form, "course_id", 40);
  const number = int(form, "number", 1, 99);
  if (!courseId || number === null) return bad("Enter a chapter number from 1 to 99.");
  const title = text(form, "title") || `Chapter ${number}`;

  const supabase = await createClient();
  const { error } = await supabase.from("chapter").insert({ course_id: courseId, number, title });
  if (error) return bad(error.code === "23505" ? `Chapter ${number} already exists.` : "Could not add the chapter.");
  revalidatePath("/admin");
  return done("Chapter added.");
}

export async function deleteChapter(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const supabase = await createClient();
  const { error } = await supabase.from("chapter").delete().eq("id", id);
  if (error) return bad("Could not delete the chapter.");
  revalidatePath("/admin");
  return done("Chapter deleted.");
}

export async function addExam(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const courseId = text(form, "course_id", 40);
  const name = text(form, "name");
  const weight = num(form, "weight", 0, 100);
  const format = text(form, "format", 10) as ExamFormat;
  if (!courseId || !name) return bad("Enter an exam name.");
  if (weight === null) return bad("Weight must be a number from 0 to 100.");
  if (!FORMATS.includes(format)) return bad("Pick a format.");

  const supabase = await createClient();
  const { count } = await supabase.from("exam").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  const { error } = await supabase
    .from("exam")
    .insert({ course_id: courseId, name, weight, format, sort_order: (count ?? 0) + 1 });
  if (error) return bad(error.code === "23505" ? "An exam with that name already exists in this course." : "Could not add the exam.");
  revalidatePath("/admin");
  return done("Exam added. Open it to set chapters and set settings.");
}

export async function deleteExam(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const supabase = await createClient();
  const { error } = await supabase.from("exam").delete().eq("id", id);
  if (error) return bad("Could not delete the exam.");
  revalidatePath("/admin");
  return done("Exam deleted.");
}

// Saves the exam, its chapters and its set settings together.
export async function updateExam(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(form, "id", 40);
  const name = text(form, "name");
  const weight = num(form, "weight", 0, 100);
  const format = text(form, "format", 10) as ExamFormat;
  const mcqMarks = int(form, "mcq_marks", 0, 1000);
  const cqMarks = int(form, "cq_marks", 0, 1000);
  const mcqMinutes = num(form, "mcq_minutes", 0, 600);
  const mcqCount = int(form, "mcq_count", 0, 200);
  const cqCount = int(form, "cq_count", 0, 100);
  const cqMarksEach = int(form, "cq_marks_each", 0, 100);

  if (!id || !name) return bad("Enter an exam name.");
  if (weight === null) return bad("Weight must be a number from 0 to 100.");
  if (!FORMATS.includes(format)) return bad("Pick a format.");
  if ([mcqMarks, cqMarks, mcqMinutes, mcqCount, cqCount, cqMarksEach].some((v) => v === null)) {
    return bad("Marks, counts and the timer must be whole numbers (the timer may use decimals).");
  }

  const supabase = await createClient();
  const { data: exam } = await supabase.from("exam").select("id, course_id").eq("id", id).maybeSingle();
  if (!exam) return bad("That exam no longer exists.");

  const { error: examError } = await supabase
    .from("exam")
    .update({
      name,
      weight,
      format,
      mcq_marks: mcqMarks!,
      cq_marks: cqMarks!,
      mcq_seconds: Math.round(mcqMinutes! * 60),
    })
    .eq("id", id);
  if (examError) return bad(examError.code === "23505" ? "Another exam in this course has that name." : "Could not save the exam.");

  const { error: settingsError } = await supabase
    .from("exam_set_settings")
    .upsert({ exam_id: id, mcq_count: mcqCount!, cq_count: cqCount!, cq_marks: cqMarksEach! });
  if (settingsError) return bad("Could not save the set settings.");

  // Only chapters of the same course may be linked.
  const { data: courseChapters } = await supabase.from("chapter").select("id").eq("course_id", exam.course_id);
  const allowed = new Set((courseChapters ?? []).map((c) => c.id));
  const wanted = new Set(form.getAll("chapters").map(String).filter((c) => allowed.has(c)));

  const { data: current } = await supabase.from("exam_chapter").select("chapter_id").eq("exam_id", id);
  const have = new Set((current ?? []).map((c) => c.chapter_id));
  const remove = [...have].filter((c) => !wanted.has(c));
  const add = [...wanted].filter((c) => !have.has(c));

  if (remove.length) {
    const { error } = await supabase.from("exam_chapter").delete().eq("exam_id", id).in("chapter_id", remove);
    if (error) return bad("Saved, but could not unlink some chapters.");
  }
  if (add.length) {
    const { error } = await supabase.from("exam_chapter").insert(add.map((chapter_id) => ({ exam_id: id, chapter_id })));
    if (error) return bad("Saved, but could not link some chapters.");
  }

  revalidatePath("/admin");
  return done("Saved.");
}
