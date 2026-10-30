import { notFound } from "next/navigation";
import { McqPlayer } from "@/components/McqPlayer";
import { SessionResult } from "@/components/SessionResult";
import { requireActive } from "@/lib/auth";
import { UUID_RE, type SessionPayload } from "@/lib/practice";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Practice | Exam Practice Studio" };

// One page for a session: the player while it is open, the result once it is finished.
// get_session loads the questions without the answer key and closes the session if the countdown ran out.
export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { profile } = await requireActive();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_session", { p_session: id });
  if (error || !data) notFound();
  const payload = data as unknown as SessionPayload;

  if (!payload.session.finished) return <McqPlayer initial={payload} />;

  // Earlier finished attempts on the same set, newest first, for "Up N points". A retry of missed
  // questions is a different test, so it is not compared with full-set attempts.
  let earlier: { score: number; max_score: number; started_at: string }[] = [];
  if (payload.session.set_id && payload.session.finished_at && !payload.session.retry_of) {
    const { data: rows } = await supabase
      .from("session_run")
      .select("score, max_score, started_at")
      .eq("user_id", profile.id)
      .eq("set_id", payload.session.set_id)
      .is("retry_of", null)
      .not("finished_at", "is", null)
      .lt("finished_at", payload.session.finished_at)
      .order("finished_at", { ascending: false })
      .limit(5);
    earlier = (rows ?? []).flatMap((r) => (r.score !== null && r.max_score !== null ? [{ score: r.score, max_score: r.max_score, started_at: r.started_at }] : []));
  }

  return <SessionResult payload={payload} earlier={earlier} />;
}
