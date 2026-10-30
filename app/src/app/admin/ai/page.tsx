import { ActionForm } from "@/components/ActionForm";
import { RouterControls } from "@/components/RouterControls";
import { JobWatcher } from "@/components/JobWatcher";
import { slotSpecs } from "@/lib/ai/slots";
import { createClient } from "@/lib/supabase/server";
import { retryJob } from "../questions/actions";
import { setKeyEnabled, setSlotEnabled, setSlotPace } from "./actions";

export const dynamic = "force-dynamic";

function wait(until: string | null) {
  if (!until) return null;
  const s = Math.ceil((new Date(until).getTime() - Date.now()) / 1000);
  return s > 0 ? s : null;
}

function ageSeconds(since: string) {
  return Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000));
}

export default async function AiRouterPage() {
  const supabase = await createClient();
  const [{ data: slots }, { data: jobs }, { data: waitingJobs }] = await Promise.all([
    supabase.from("api_slot").select("*").order("priority"),
    supabase.from("job").select("id, kind, status, attempts, error, created_at, finished_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("job").select("kind, status, created_at").in("status", ["queued", "running"]).order("created_at"),
  ]);
  const keys = [...new Set((slots ?? []).map((s) => s.key_name))].sort();
  const waitByKind = new Map<string, number>();
  for (const j of waitingJobs ?? []) waitByKind.set(j.kind, (waitByKind.get(j.kind) ?? 0) + 1);
  const oldest = waitingJobs?.[0] ? ageSeconds(waitingJobs[0].created_at) : null;

  const counts = { queued: 0, running: 0, done: 0, failed: 0 } as Record<string, number>;
  for (const j of jobs ?? []) counts[j.status] = (counts[j.status] ?? 0) + 1;
  const active = (jobs ?? []).filter((j) => j.status === "queued" || j.status === "running").map((j) => j.id);
  const configured = slotSpecs(process.env).length;

  return (
    <section className="stack" style={{ gap: 22 }}>
      <JobWatcher jobIds={active} />
      <div className="stack-sm">
        <h1 className="heading">
          AI router <span className="accent">{(slots ?? []).filter((s) => s.enabled).length}</span>
        </h1>
        <p className="small muted">
          Every Gemini request goes through these slots in order. A slot that hits a limit rests and the next one takes over. Pace is the gap between two requests on one slot.
        </p>
        <RouterControls waiting={active.length > 0} />
      </div>

      {keys.length > 0 ? (
        <div className="card rows">
          {keys.map((k) => {
            const on = (slots ?? []).some((s) => s.key_name === k && s.enabled);
            return (
              <div key={k} className="row">
                <span className="small">
                  <span className="row-name">Key {k}</span>
                  <span className="muted" style={{ display: "block" }}>
                    {k === "B" ? "Second Google project. Switch it off if its use is ever in doubt." : "First Google project."}
                  </span>
                </span>
                <ActionForm action={setKeyEnabled} submitLabel={on ? "Switch off" : "Switch on"} buttonClass="btn btn-small">
                  <input type="hidden" name="key_name" value={k} />
                  <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                </ActionForm>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="card rows">
        {(slots ?? []).map((s) => {
          const cooling = wait(s.cooldown_until);
          const ready = s.enabled && !cooling && !wait(s.next_allowed_at);
          return (
            <div key={s.id} className="student">
              <div className="between">
                <div>
                  <p className="row-name">
                    Key {s.key_name} <span className="muted">{s.tier}</span>
                  </p>
                  <p className="small muted">{s.model}</p>
                </div>
                <span className={`chip ${!s.enabled ? "chip-muted" : cooling ? "chip-now" : ready ? "chip-done" : "chip"}`}>
                  {!s.enabled ? "Off" : cooling ? `Resting ${cooling}s` : ready ? "Ready" : "Pacing"}
                </span>
              </div>
              {s.last_error ? <p className="small">Last problem: {s.last_error}</p> : null}
              <div className="wrap" style={{ alignItems: "flex-start", gap: 20 }}>
                <ActionForm action={setSlotEnabled} submitLabel={s.enabled ? "Switch off" : "Switch on"} buttonClass="btn btn-small" className="wrap">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="enabled" value={s.enabled ? "false" : "true"} />
                </ActionForm>
                <ActionForm action={setSlotPace} submitLabel="Save pace" buttonClass="btn btn-small" className="inline-form">
                  <input type="hidden" name="id" value={s.id} />
                  <div className="field">
                    <label className="label" htmlFor={`pace-${s.id}`}>Pace (seconds)</label>
                    <input id={`pace-${s.id}`} name="pace_seconds" inputMode="numeric" className="input input-sm" defaultValue={s.pace_seconds} />
                  </div>
                </ActionForm>
              </div>
            </div>
          );
        })}
        {(slots ?? []).length === 0 ? (
          <p className="small muted">
            {configured === 0
              ? "No slots yet. Set GEMINI_KEY_A, GEMINI_MODEL_PRIMARY and GEMINI_MODEL_BACKUP in the environment."
              : "Slots appear the first time a job runs."}
          </p>
        ) : null}
      </div>

      <div className="stack-sm">
        <p className="label">Queue, latest jobs</p>
        <p className="small muted">
          {counts.queued} waiting · {counts.running} running · {counts.done} done · {counts.failed} failed (latest 12)
        </p>
        <p className="small muted">
          Waiting or running now: {(waitingJobs ?? []).length === 0 ? "nothing" : [...waitByKind.entries()].map(([k, n]) => `${n} ${k}`).join(", ")}
          {oldest !== null ? `. Oldest has waited ${oldest} s.` : "."} Marking jobs go before question generation.
        </p>
        <div className="card rows">
          {(jobs ?? []).map((j) => (
            <div key={j.id} className="row">
              <span className="small">
                {j.kind} · {new Date(j.created_at).toLocaleString("en-GB")}
                {j.attempts ? ` · ${j.attempts} attempt${j.attempts === 1 ? "" : "s"}` : ""}
                {j.error ? <span className="muted" style={{ display: "block" }}>{j.error}</span> : null}
              </span>
              <span className="wrap">
                <span className={`chip ${j.status === "done" ? "chip-done" : j.status === "failed" ? "chip-muted" : "chip-now"}`}>{j.status}</span>
                {j.status === "failed" ? (
                  <ActionForm action={retryJob} submitLabel="Retry" buttonClass="btn btn-small">
                    <input type="hidden" name="id" value={j.id} />
                  </ActionForm>
                ) : null}
              </span>
            </div>
          ))}
          {(jobs ?? []).length === 0 ? <p className="small muted">No jobs yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
