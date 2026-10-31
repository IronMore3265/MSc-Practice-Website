import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth";
import { runTick } from "@/lib/ai/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Poll a job. Row level security means you see only your own jobs (the admin sees all).
// While the job is waiting or running, each poll also runs a router tick after the response is sent.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (session.profile?.status !== "active") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("job")
    .select("id, kind, status, attempts, payload, created_at, started_at, finished_at, priority")
    .eq("id", id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let position: number | null = null;
  let paused = false;
  if (job.status === "queued") {
    const { count } = await supabase
      .from("job")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .or(`priority.lt.${job.priority},and(priority.eq.${job.priority},created_at.lt.${job.created_at})`);
    position = (count ?? 0) + 1;
    // Slots are admin-only rows, so the count is read on the server. With none switched on the job cannot move,
    // and the screen says so instead of showing a queue position that never changes.
    const { count: slots } = await createAdminClient().from("api_slot").select("id", { count: "exact", head: true }).eq("enabled", true);
    paused = (slots ?? 0) === 0;
  }
  if (job.status === "queued" || job.status === "running") {
    // A running job also gets a tick, because a tick recovers jobs that got stuck.
    after(async () => {
      await runTick();
    });
  }

  // A finished grading job carries its feedback, read through row level security from the student's own attempt.
  // Raw job errors and payloads stay on the server, the student only needs to know that it failed.
  let graded: { score: number; feedback: unknown } | null = null;
  const attemptId = (job.payload as { attempt_id?: unknown } | null)?.attempt_id;
  if (job.kind === "grade" && job.status === "done" && typeof attemptId === "string") {
    const { data: attempt } = await supabase.from("attempt").select("score, feedback, graded_at").eq("id", attemptId).maybeSingle();
    if (attempt?.graded_at) graded = { score: attempt.score, feedback: attempt.feedback };
  }

  // A finished reading carries the text for the correction step and the parts it was unsure about.
  let read: { transcription: string; unsure: unknown } | null = null;
  if (job.kind === "transcribe" && job.status === "done" && typeof attemptId === "string") {
    const { data: attempt } = await supabase.from("attempt").select("transcription, transcription_unsure, transcribe_job_id").eq("id", attemptId).maybeSingle();
    if (attempt?.transcription && attempt.transcribe_job_id === job.id) read = { transcription: attempt.transcription, unsure: attempt.transcription_unsure ?? [] };
  }

  const { payload: _payload, priority: _priority, ...visible } = job;
  void _payload;
  void _priority;
  return NextResponse.json({ job: visible, position, paused, ...(graded ?? {}), ...(read ?? {}) });
}
