import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

const BAD_CODE = "That invite code is not valid or has expired.";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Public sign-up is off in Supabase, so this is the only way an account gets created.
// Order matters: the invite code is checked before anything else, so the route cannot be used
// to find out which emails already have an account.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("Bad request.");
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const code = String(body.code ?? "").trim().toUpperCase();

  if (name.length < 1 || name.length > 80) return fail("Enter your name (up to 80 characters).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email address.");
  if (password.length < 8 || password.length > 72) return fail("The password must be 8 to 72 characters.");

  const db = createAdminClient();

  // First admin: ADMIN_EMAIL may sign up without a code, but only while no admin exists yet.
  if (isAdminEmail(email)) {
    const { count } = await db.from("profile").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) === 0) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error || !data.user) return fail(error?.code === "weak_password" ? error.message : "Could not create the account.");
      const { error: profileError } = await db.from("profile").insert({
        id: data.user.id,
        name,
        email,
        role: "admin",
        status: "active",
        approved_at: new Date().toISOString(),
      });
      if (profileError) {
        await db.auth.admin.deleteUser(data.user.id);
        return fail("Could not create the account.", 500);
      }
      return NextResponse.json({ ok: true, status: "active" }, { status: 201 });
    }
  }

  if (!code) return fail(BAD_CODE);

  const { data: invite } = await db
    .from("invite")
    .select("id")
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!invite) return fail(BAD_CODE);

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists") return fail("An account with this email already exists.", 409);
    if (error?.code === "weak_password") return fail(error.message);
    return fail("Could not create the account.");
  }

  // Re-checks the code under a row lock, creates the pending profile and marks the code used.
  const { error: redeemError } = await db.rpc("redeem_invite", {
    p_code: code,
    p_user_id: data.user.id,
    p_name: name,
    p_email: email,
  });
  if (redeemError) {
    await db.auth.admin.deleteUser(data.user.id);
    return fail(BAD_CODE);
  }

  return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
}
