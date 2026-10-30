import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth";
import { runTick } from "@/lib/ai/router";
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
    .select("id, kind, status, attempts, error, result, created_at, finished_at, priority")
    .eq("id", id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let position: number | null = null;
  if (job.status === "queued") {
    const { count } = await supabase
      .from("job")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .or(`priority.lt.${job.priority},and(priority.eq.${job.priority},created_at.lt.${job.created_at})`);
    position = (count ?? 0) + 1;
  }
  if (job.status === "queued" || job.status === "running") {
    // A running job also gets a tick, because a tick recovers jobs that got stuck.
    after(async () => {
      await runTick();
    });
  }

  return NextResponse.json({ job, position });
}
