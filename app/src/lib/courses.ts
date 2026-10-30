import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Courses for the admin pickers, newest semester first, so the default course is in the current semester.
export async function adminCourses(supabase: Client) {
  const { data } = await supabase.from("course").select("*, semester(name, sort_order)").order("sort_order");
  return (data ?? []).sort((a, b) => (b.semester?.sort_order ?? 0) - (a.semester?.sort_order ?? 0) || a.sort_order - b.sort_order);
}
