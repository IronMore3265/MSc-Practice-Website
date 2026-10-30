import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The sets of an exam with their question counts. Visible to every approved member.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (session.profile?.status !== "active") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_set")
    .select("id, name, origin, chapter_id, created_at, question_set_item(count)")
    .eq("exam_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: "Could not load the sets." }, { status: 500 });
  return NextResponse.json({
    sets: data.map((s) => ({ id: s.id, name: s.name, origin: s.origin, chapter_id: s.chapter_id, created_at: s.created_at, questions: s.question_set_item[0]?.count ?? 0 })),
  });
}

// "New random set": any approved member can ask for another set. The database picks the questions.
// An optional chapter_id makes a set for that chapter of the exam only.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (session.profile?.status !== "active") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { chapter_id?: unknown };
  const chapterId = typeof body.chapter_id === "string" ? body.chapter_id : undefined;
  if (chapterId !== undefined && !UUID.test(chapterId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data, error } = await createAdminClient().rpc("create_auto_set", { p_exam_id: id, p_user: session.user.id, p_chapter_id: chapterId });
  if (error) {
    if (error.message.includes("no_questions"))
      return NextResponse.json({ error: chapterId ? "There are no approved questions for this chapter yet." : "There are no approved questions for this exam yet." }, { status: 409 });
    if (error.message.includes("too_many_sets")) return NextResponse.json({ error: "This exam already has the maximum number of sets." }, { status: 409 });
    if (error.message.includes("unknown_exam") || error.message.includes("unknown_chapter")) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ error: "Could not create a set." }, { status: 500 });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
