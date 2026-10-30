import { NextResponse, after } from "next/server";
import { runTick } from "@/lib/ai/router";
import { UUID_RE } from "@/lib/practice";
import { practiceError, readJson, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Read the handwriting on the photos already attached to this question. The database checks the photos, the
// limit of 3 readings per answer and the daily cap, and queues the job. The job runs through the request router.
// Body: { session_id }. The id in the path is the question id.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const body = await readJson(request);
  const sessionId = body?.session_id;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return NextResponse.json({ error: "Missing session." }, { status: 400 });

  const { data, error } = await auth.supabase.rpc("start_cq_transcription", { p_session: sessionId, p_question: id });
  if (error) return practiceError(error);

  after(async () => {
    await runTick();
  });
  return NextResponse.json(data, { status: 201 });
}
