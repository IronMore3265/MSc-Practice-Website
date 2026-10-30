import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/database.types";
import { JobFatalError, classifyError } from "./errors";
import { runGenerateJob } from "./generate-job";
import { apiKeyFor, slotSpecs } from "./slots";

// The request router and queue (plan 5b). A "tick" claims one waiting job on a ready slot and runs it.
// Every Gemini call in the app goes through here. Pages poll /api/jobs/{id}, and each poll runs a tick.

type Db = SupabaseClient<Database>;
type Claim = {
  job: { id: string; user_id: string; kind: string; payload: Json; attempts: number };
  slot: { id: string; key_name: string; tier: string; model: string };
};
type Handler = (a: { db: Db; job: Claim["job"]; apiKey: string; model: string }) => Promise<Json>;

const HANDLERS: Record<string, Handler | undefined> = {
  generate: runGenerateJob,
};

const MAX_ATTEMPTS = 3;
const MAX_SLOT_TRIES = 4;

export type TickResult = { ran: boolean; jobId?: string; outcome?: "done" | "requeued" | "failed" | "rate_limited" };

// Keeps the slot rows in line with the environment: model names, which keys exist, fallback order.
// Pace, enabled and cooldown are left alone, because the admin edits those.
export async function ensureSlots(db: Db) {
  const specs = slotSpecs(process.env);
  const { data: existing } = await db.from("api_slot").select("id, key_name, tier, enabled, last_error");

  if (specs.length) {
    await db.from("api_slot").upsert(
      specs.map((s) => ({ key_name: s.key_name, tier: s.tier, model: s.model, priority: s.priority })),
      { onConflict: "key_name,tier" },
    );
  }
  const wanted = new Set(specs.map((s) => `${s.key_name}:${s.tier}`));
  for (const row of existing ?? []) {
    const configured = wanted.has(`${row.key_name}:${row.tier}`);
    if (!configured && row.enabled) {
      await db.from("api_slot").update({ enabled: false, last_error: "Not configured", last_error_at: new Date().toISOString() }).eq("id", row.id);
    } else if (configured && row.last_error === "Not configured") {
      await db.from("api_slot").update({ enabled: true, last_error: null }).eq("id", row.id);
    }
  }
}

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

export async function runTick(db: Db = createAdminClient()): Promise<TickResult> {
  await ensureSlots(db);

  for (let i = 0; i < MAX_SLOT_TRIES; i++) {
    const { data, error } = await db.rpc("claim_next_job");
    if (error || !data) return { ran: false };
    const claim = data as unknown as Claim;
    const { job, slot } = claim;
    const apiKey = apiKeyFor(slot.key_name, process.env);

    try {
      const handler = HANDLERS[job.kind];
      if (!handler) throw new JobFatalError(`Jobs of kind '${job.kind}' are not supported yet.`);
      if (!apiKey) throw Object.assign(new Error("No API key for this slot"), { status: 401 });
      const result = await handler({ db, job, apiKey, model: slot.model });
      await db.from("job").update({ status: "done", result, error: null, finished_at: new Date().toISOString() }).eq("id", job.id);
      return { ran: true, jobId: job.id, outcome: "done" };
    } catch (err) {
      const verdict = classifyError(err);
      const note = short(err);

      if (verdict.kind === "rate_limit" || verdict.kind === "slot_problem") {
        const seconds = verdict.kind === "rate_limit" ? verdict.retryAfterSec : verdict.cooldownSec;
        await db
          .from("api_slot")
          .update({
            cooldown_until: inSeconds(seconds),
            last_error: verdict.kind === "rate_limit" ? `Rate limited: ${note}` : `${verdict.reason}: ${note}`,
            last_error_at: new Date().toISOString(),
          })
          .eq("id", slot.id);
        await db.from("job").update({ status: "queued", slot_id: null }).eq("id", job.id);
        continue; // the job did not fail, the slot is resting: try the next slot
      }

      const attempts = job.attempts + 1;
      const failed = verdict.kind === "fatal" || attempts >= MAX_ATTEMPTS;
      await db
        .from("job")
        .update({
          status: failed ? "failed" : "queued",
          attempts,
          slot_id: failed ? slot.id : null,
          error: verdict.kind === "fatal" ? verdict.message : note,
          finished_at: failed ? new Date().toISOString() : null,
        })
        .eq("id", job.id);
      if (verdict.kind !== "fatal") {
        await db.from("api_slot").update({ last_error: note, last_error_at: new Date().toISOString() }).eq("id", slot.id);
      }
      return { ran: true, jobId: job.id, outcome: failed ? "failed" : "requeued" };
    }
  }
  return { ran: true, outcome: "rate_limited" };
}
