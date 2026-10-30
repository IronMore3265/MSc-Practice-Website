import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Db = SupabaseClient<Database>;

const BUCKET = "answer-photos";
const STALE_HOURS = 48;

// Deletes an attempt's photos from storage and forgets them in the database. Service client only.
// Answer photos are kept just long enough to be read and marked (plan section 5), then only the text stays.
export async function purgeAttemptPhotos(db: Db, attemptId: string): Promise<void> {
  const { data: attempt } = await db.from("attempt").select("id, user_id, photo_paths").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.photo_paths.length === 0) return;
  // Only ever delete inside this student's own folder for this attempt.
  const prefix = `${attempt.user_id}/${attempt.id}/`;
  const paths = attempt.photo_paths.filter((p) => p.startsWith(prefix));
  if (paths.length) {
    const { error } = await db.storage.from(BUCKET).remove(paths);
    if (error) return; // keep the list so the cleanup tries again
  }
  await db.from("attempt").update({ photo_paths: [], photos_added_at: null }).eq("id", attempt.id);
}

// Leftovers: photos of answers that were marked (the grade job could not delete them) and photos nobody used
// for two days. Runs from the daily cron. Returns how many attempts were cleaned.
export async function purgeStalePhotos(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();
  const { data: rows } = await db
    .from("attempt")
    .select("id, graded_at, photos_added_at, photo_paths")
    .filter("photo_paths", "neq", "{}")
    .or(`graded_at.not.is.null,photos_added_at.lt.${cutoff}`)
    .limit(200);
  let n = 0;
  for (const row of rows ?? []) {
    await purgeAttemptPhotos(db, row.id);
    n++;
  }
  return n;
}
