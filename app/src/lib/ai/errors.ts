// Sorting Gemini failures into what the router should do next. Pure, so it can be tested without the API.

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

// A job that can never succeed (for example, its chapter has no imported PDF). Fails at once, no retries.
export class JobFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobFatalError";
  }
}

export type ErrorClass =
  | { kind: "rate_limit"; retryAfterSec: number } // rest this slot (limit hit or model overloaded), try the next one, the job keeps its attempts
  | { kind: "slot_problem"; cooldownSec: number; reason: string } // bad key or model name: rest the slot for a long time
  | { kind: "timeout"; cooldownSec: number } // the call hung: rest this slot so the retry goes to another one, counts as an attempt
  | { kind: "transient" } // network or server trouble: the job tries again, counts as an attempt
  | { kind: "job_error" } // the model's answer or our request was unusable: counts as an attempt
  | { kind: "fatal"; message: string }; // fail the job now

export const DEFAULT_RATE_LIMIT_SEC = 60;
export const OVERLOADED_SEC = 30;
export const TIMEOUT_REST_SEC = 60;

export function statusOf(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof e.status === "number") return e.status;
  if (typeof e.code === "number") return e.code;
  const m = typeof e.message === "string" ? /"code"\s*:\s*(\d{3})/.exec(e.message) : null;
  return m ? Number(m[1]) : null;
}

// The API says how long to wait as "retryDelay": "34s" or in the text "Please retry in 34.5s".
export function parseRetryDelay(message: string): number | null {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(message);
  return m ? Math.ceil(Number(m[1])) : null;
}

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof JobFatalError) return { kind: "fatal", message: err.message };
  if (err instanceof ModelOutputError) return { kind: "job_error" };
  const m = (err as { message?: unknown } | null)?.message;
  const message = typeof m === "string" ? m : String(err);
  const status = statusOf(err);

  // An overloaded model sometimes hangs instead of answering 503. Our own timeout aborts the call.
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError" || (status === null && /aborted|timed? ?out/i.test(message))) {
    return { kind: "timeout", cooldownSec: TIMEOUT_REST_SEC };
  }

  if (status === 429) {
    const wait = parseRetryDelay(message) ?? DEFAULT_RATE_LIMIT_SEC;
    return { kind: "rate_limit", retryAfterSec: Math.min(Math.max(wait, 5), 3600) };
  }
  // 503 "high demand": the model is overloaded right now. Rest this slot briefly so the backup model takes over.
  if (status === 503) return { kind: "rate_limit", retryAfterSec: OVERLOADED_SEC };
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) {
    return { kind: "slot_problem", cooldownSec: 3600, reason: "The API key was rejected" };
  }
  if (status === 404) return { kind: "slot_problem", cooldownSec: 600, reason: "Model not found, check the model name in the settings" };
  if (status === 400) return { kind: "job_error" };
  return { kind: "transient" };
}
