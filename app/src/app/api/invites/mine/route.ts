import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The caller's own invite codes (row level security hides everyone else's).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data, error } = await supabase
    .from("invite")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load invite codes." }, { status: 500 });
  return NextResponse.json({ invites: data });
}
