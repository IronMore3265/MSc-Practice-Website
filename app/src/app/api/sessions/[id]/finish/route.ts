import { NextResponse } from "next/server";
import { purgeAttemptPhotos } from "@/lib/ai/photos";
import { UUID_RE } from "@/lib/practice";
import { practiceError, requireUserClient } from "@/lib/practice-api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// End a session. Unanswered questions count as missed. Safe to call twice.
// Photos attached to questions that were never submitted are deleted now, nobody will use them.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const { error } = await auth.supabase.rpc("finish_mcq_session", { p_session: id });
  if (error) return practiceError(error);

  // The finish above proved the session is this student's. Row level security lists only their attempts.
  const { data: left } = await auth.supabase.from("attempt").select("id").eq("session_run_id", id).is("answered_at", null).filter("photo_paths", "neq", "{}");
  if (left?.length) {
    const admin = createAdminClient();
    await Promise.all(left.map((a) => purgeAttemptPhotos(admin, a.id).catch(() => undefined)));
  }
  return NextResponse.json({ status: "ok" });
}
