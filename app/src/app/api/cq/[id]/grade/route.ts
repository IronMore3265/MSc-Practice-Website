import { NextResponse, after } from "next/server";
import { runTick } from "@/lib/ai/router";
import { UUID_RE } from "@/lib/practice";
import { practiceError, readJson, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Submit a typed CQ answer. The database saves it, checks the daily cap and queues a grading job in one step.
// The job itself runs through the request router (plan 5b), here and on every poll of /api/jobs/{id}.
// Body: { session_id, answer, seconds? }. The id in the path is the question id.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const body = await readJson(request);
  const sessionId = body?.session_id;
  const answer = body?.answer;
  const seconds = body?.seconds;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return NextResponse.json({ error: "Missing session." }, { status: 400 });
  if (typeof answer !== "string") return NextResponse.json({ error: "Write your answer first." }, { status: 400 });
  if (seconds != null && (typeof seconds !== "number" || !Number.isFinite(seconds))) return NextResponse.json({ error: "Invalid time." }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("submit_cq_answer", {
    p_session: sessionId,
    p_question: id,
    p_answer: answer,
    p_seconds: seconds == null ? undefined : Math.round(seconds),
  });
  if (error) return practiceError(error);

  after(async () => {
    await runTick();
  });
  return NextResponse.json(data, { status: 201 });
}
