"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";

const done = (message: string): ActionState => ({ ok: true, message });
const bad = (message: string): ActionState => ({ ok: false, message });

// Switch a slot on or off. Switching the Key B slots off is the plan's safety switch (section 5b).
export async function setSlotEnabled(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const enabled = String(form.get("enabled") ?? "") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("api_slot").update({ enabled }).eq("id", id);
  if (error) return bad("Could not change the slot.");
  revalidatePath("/admin/ai");
  return done(enabled ? "Slot on." : "Slot off.");
}

// Seconds between two requests on one slot. 12 suits a 5 requests per minute limit.
export async function setSlotPace(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const raw = String(form.get("pace_seconds") ?? "").trim();
  const pace = /^\d{1,4}$/.test(raw) ? Number(raw) : null;
  if (pace === null || pace > 600) return bad("Pace is a whole number of seconds from 0 to 600.");
  const supabase = await createClient();
  const { error } = await supabase.from("api_slot").update({ pace_seconds: pace }).eq("id", id);
  if (error) return bad("Could not save the pace.");
  revalidatePath("/admin/ai");
  return done("Saved.");
}
