import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/practice";
import { practiceError, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";

// End a session. Unanswered questions count as missed. Safe to call twice.
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const { error } = await auth.supabase.rpc("finish_mcq_session", { p_session: id });
  if (error) return practiceError(error);
  return NextResponse.json({ status: "ok" });
}
