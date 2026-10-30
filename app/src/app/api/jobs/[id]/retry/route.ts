import { NextResponse, after } from "next/server";
import { runTick } from "@/lib/ai/router";
import { UUID_RE } from "@/lib/practice";
import { requireUserClient } from "@/lib/practice-api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// "Retry" on a grading job that failed three times (plan 5b). The answer is never dropped: the same job goes back
// in the queue with the same saved answer. The service key is used only after row level security confirmed
// that the job is yours (or you are the admin) and that it really failed.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const { data: job } = await auth.supabase.from("job").select("id, kind, status").eq("id", id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (job.kind !== "grade" && job.kind !== "transcribe") return NextResponse.json({ error: "This job cannot be retried here." }, { status: 400 });
  if (job.status !== "failed") return NextResponse.json({ error: "This job did not fail." }, { status: 409 });

  const { error } = await createAdminClient()
    .from("job")
    .update({ status: "queued", attempts: 0, error: null, finished_at: null, started_at: null, slot_id: null })
    .eq("id", id)
    .eq("status", "failed");
  if (error) return NextResponse.json({ error: "Could not retry. Try again." }, { status: 500 });

  after(async () => {
    await runTick();
  });
  return NextResponse.json({ ok: true });
}
