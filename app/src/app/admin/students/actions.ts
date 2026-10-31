"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";

// Student management. Profile rows cannot be edited from the browser at all (no update grant),
// so these actions use the service role, and only after requireAdmin() has passed.

const done = (message: string): ActionState => ({ ok: true, message });
const bad = (message: string): ActionState => ({ ok: false, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function targetId(form: FormData) {
  const id = String(form.get("id") ?? "");
  return UUID.test(id) ? id : null;
}

// Approve a pending account, re-enable a disabled one, or turn an account off.
export async function setStudentStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile: admin } = await requireAdmin();
  const id = targetId(form);
  const to = String(form.get("to") ?? "");
  if (!id || (to !== "active" && to !== "disabled")) return bad("Bad request.");
  if (id === admin.id) return bad("You cannot change your own account.");

  const db = createAdminClient();
  const update =
    to === "active"
      ? { status: "active" as const, approved_by: admin.id, approved_at: new Date().toISOString() }
      : { status: "disabled" as const };
  const { data, error } = await db.from("profile").update(update).eq("id", id).select("name").maybeSingle();
  if (error || !data) return bad("Could not update that account.");

  revalidatePath("/admin/students");
  return done(to === "active" ? `${data.name} is approved.` : `${data.name} is switched off.`);
}

export async function setStudentLimits(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = targetId(form);
  const dailyCap = Number(form.get("daily_cap"));
  const inviteLimit = Number(form.get("invite_limit"));
  if (!id) return bad("Bad request.");
  if (!Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > 1000) return bad("Daily cap must be a whole number from 0 to 1000.");
  if (!Number.isInteger(inviteLimit) || inviteLimit < 0 || inviteLimit > 100) return bad("Invite limit must be a whole number from 0 to 100.");

  const db = createAdminClient();
  const { error } = await db.from("profile").update({ daily_cap: dailyCap, invite_limit: inviteLimit }).eq("id", id);
  if (error) return bad("Could not save the limits.");

  revalidatePath("/admin/students");
  return done("Limits saved.");
}

// No email service in v1, so the admin sets a new password and passes it on.
export async function resetStudentPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = targetId(form);
  const password = String(form.get("password") ?? "");
  if (!id) return bad("Bad request.");
  if (password.length < 8 || password.length > 72) return bad("The password must be 8 to 72 characters.");

  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(id, { password });
  if (error) return bad(error.code === "weak_password" ? error.message : "Could not reset the password.");
  return done("Password changed. Tell the student the new password.");
}

// Switch the leaderboard on or off for everyone. Students still choose to join it themselves.
export async function setLeaderboard(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const on = String(form.get("on") ?? "") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("app_setting").update({ leaderboard_on: on, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return bad("Could not change the leaderboard.");

  revalidatePath("/admin/students");
  revalidatePath("/");
  return done(on ? "The leaderboard is on." : "The leaderboard is off.");
}
