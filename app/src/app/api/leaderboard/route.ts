import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Join or leave the leaderboard. Only sets started after joining count.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (session.profile?.status !== "active") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { on?: unknown };
  if (typeof body.on !== "boolean") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_leaderboard_opt_in", { p_on: body.on });
  if (error) return NextResponse.json({ error: "Could not change that. Try again." }, { status: 500 });
  return NextResponse.json({ joined: data !== null });
}
