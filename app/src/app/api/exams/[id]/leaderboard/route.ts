import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The leaderboard of one exam: top 10 plus your own row. Empty while the admin has it switched off.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (session.profile?.status !== "active") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exam_leaderboard", { p_exam_id: id });
  if (error) return NextResponse.json({ error: "Could not load the leaderboard." }, { status: 500 });
  return NextResponse.json({
    rows: data.map((r) => ({ rank: r.rank, name: r.name, avgPercent: r.avg_percent, sessions: r.sessions, isMe: r.is_me })),
  });
}
