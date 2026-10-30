import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/database.types";

export function isAdminEmail(email: string | null | undefined) {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!admin && !!email && email.trim().toLowerCase() === admin;
}

// ADMIN_EMAIL becomes the admin on first sign-in. A confirmed email is required, so only the
// real owner of that address can claim it (accounts are created by the server, already confirmed).
async function ensureAdminProfile(user: User, existing: Profile | null): Promise<Profile | null> {
  if (!isAdminEmail(user.email) || !user.email_confirmed_at) return existing;
  if (existing?.role === "admin" && existing.status === "active") return existing;

  const db = createAdminClient();
  const now = new Date().toISOString();
  if (existing) {
    const { data } = await db
      .from("profile")
      .update({ role: "admin", status: "active", approved_at: existing.approved_at ?? now })
      .eq("id", user.id)
      .select()
      .single();
    return data ?? existing;
  }
  const name = (user.user_metadata?.name as string | undefined)?.slice(0, 80) || "Admin";
  const { data } = await db
    .from("profile")
    .insert({ id: user.id, name, email: user.email!, role: "admin", status: "active", approved_at: now })
    .select()
    .single();
  return data;
}

export type SessionUser = { id: string; email: string | undefined };

// The signed-in user and their profile, or null when signed out. One lookup per request.
// getClaims checks the session token's signature locally (the project uses asymmetric signing keys), so a page
// load does not wait on the Auth server. Blocking a member still works at once: their profile status is read here.
export const getSession = cache(async (): Promise<{ user: SessionUser; profile: Profile | null } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const user: SessionUser = { id: claims.sub, email: claims.email };
  const { data: profile } = await supabase.from("profile").select("*").eq("id", user.id).maybeSingle();
  // Only the admin's first sign-in needs the full user record (it checks the email is confirmed).
  if (isAdminEmail(user.email) && !(profile?.role === "admin" && profile.status === "active")) {
    const {
      data: { user: full },
    } = await supabase.auth.getUser();
    if (full) return { user, profile: await ensureAdminProfile(full, profile) };
  }
  return { user, profile };
});

// Any signed-in, approved member.
export async function requireActive() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile || session.profile.status !== "active") redirect("/waiting");
  return { user: session.user, profile: session.profile };
}

// Admin only. Used by every admin page and every admin server action.
export async function requireAdmin() {
  const session = await requireActive();
  if (session.profile.role !== "admin") redirect("/");
  return session;
}
