"use server";

import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// "Mark all read" in the notifications panel. Row level security limits it to the student's own rows,
// and only read_at may be changed.
export async function markAllNotificationsRead() {
  const { profile } = await requireActive();
  const supabase = await createClient();
  await supabase.from("notification").update({ read_at: new Date().toISOString() }).eq("user_id", profile.id).is("read_at", null);
  revalidatePath("/");
}
