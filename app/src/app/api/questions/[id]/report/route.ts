import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/practice";
import { readJson, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";

// "Report question": flag a question for the admin to look at. One report per student per question.
// Row level security checks that the student is approved and can see the question.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const body = await readJson(request);
  const raw = typeof body?.note === "string" ? body.note.trim() : "";
  if (raw.length > 500) return NextResponse.json({ error: "Keep the note under 500 characters." }, { status: 400 });

  const { error } = await auth.supabase.from("question_report").insert({ question_id: id, user_id: auth.user.id, note: raw || null });
  if (error && error.code !== "23505") {
    if (error.code === "42501") return NextResponse.json({ error: "You cannot report this question." }, { status: 403 });
    return NextResponse.json({ error: "Could not send the report." }, { status: 500 });
  }
  return NextResponse.json({ status: "ok" }, { status: 201 });
}
