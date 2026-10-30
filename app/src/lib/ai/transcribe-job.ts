import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { JobFatalError } from "./errors";
import { generateJson, type InlineImage } from "./gemini";
import { MAX_PHOTOS, TRANSCRIBE_SCHEMA, buildTranscribePrompt, validateTranscription } from "./transcription";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads the handwriting on an attempt's photos and saves the text for the student to correct. Called only by the router.
// The photos are read from the private bucket with the service key, but only the paths the database lists for this
// student's own attempt. They stay in storage until the answer is marked (see purgeAttemptPhotos).
export async function runTranscribeJob(args: { db: Db; job: { id: string; user_id: string; payload: unknown }; apiKey: string; model: string }) {
  const { db, job } = args;
  const attemptId = (job.payload as { attempt_id?: unknown } | null)?.attempt_id;
  if (typeof attemptId !== "string" || !UUID.test(attemptId)) throw new JobFatalError("The job has no photos to read.");

  const { data: attempt } = await db
    .from("attempt")
    .select("id, user_id, question_id, photo_paths, transcribe_job_id, answered_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== job.user_id) throw new JobFatalError("The answer no longer exists.");
  // The student started over or answered in the meantime: nothing to do, and no Gemini call to spend.
  if (attempt.transcribe_job_id !== job.id || attempt.answered_at) return { skipped: true } as unknown as Json;

  const prefix = `${attempt.user_id}/${attempt.id}/`;
  const paths = attempt.photo_paths.filter((p) => p.startsWith(prefix)).slice(0, MAX_PHOTOS);
  if (!paths.length) throw new JobFatalError("The photos are gone.");

  const { data: question } = await db.from("question").select("id, text, kind").eq("id", attempt.question_id).maybeSingle();
  if (!question || (question.kind !== "cq" && question.kind !== "problem")) throw new JobFatalError("The question no longer exists.");

  const images: InlineImage[] = [];
  for (const path of paths) {
    const { data: file } = await db.storage.from("answer-photos").download(path);
    if (!file) throw new JobFatalError("A photo could not be found. Take the photos again.");
    images.push({ mimeType: "image/jpeg", data: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  const { system, user } = buildTranscribePrompt({ question: question.text, photoCount: images.length, kind: question.kind });
  const raw = await generateJson({ apiKey: args.apiKey, model: args.model, system, user, schema: TRANSCRIBE_SCHEMA, images, temperature: 0.1 });
  const reading = validateTranscription(raw);

  const { error } = await db.rpc("record_cq_transcription", {
    p_attempt: attempt.id,
    p_job: job.id,
    p_text: reading.text,
    p_unsure: reading.unsure as unknown as Json,
  });
  if (error) throw new Error(`Could not save the reading: ${error.message}`);

  return { attempt_id: attempt.id, photos: images.length, chars: reading.text.length, unsure: reading.unsure.length, model: args.model } as unknown as Json;
}
