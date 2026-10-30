import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Create an invite code. The create_invite() database function checks that the caller is an active
// member and enforces the limit on unused codes, so the rules hold even if this route is bypassed.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data, error } = await supabase.rpc("create_invite");
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: "Your account is not approved yet." }, { status: 403 });
    if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Could not create an invite code." }, { status: 500 });
  }
  return NextResponse.json({ invite: data }, { status: 201 });
}
