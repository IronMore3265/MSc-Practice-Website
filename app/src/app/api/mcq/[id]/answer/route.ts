import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/practice";
import { practiceError, readJson, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";

// Record the pick for one question and return the verdict with the explanations.
// [id] is the question id. Body: { session_id, option_id }. Never calls the AI.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const body = await readJson(request);
  const sessionId = body?.session_id;
  const optionId = body?.option_id;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId) || typeof optionId !== "string" || !UUID_RE.test(optionId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("answer_mcq", { p_session: sessionId, p_question: id, p_option: optionId });
  if (error) return practiceError(error);
  return NextResponse.json(data);
}
