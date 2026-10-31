// Shapes and helpers for CQ practice and grading. Used by server and client code, so nothing here
// touches the server only modules. Plan sections 5c and 7.

import type { SessionFigure } from "./practice.ts";

export type JobStatus = "queued" | "running" | "done" | "failed";

// What the grader returns, after strict checking (see lib/ai/grading.ts). Shape follows plan section 7.
export type GradeFeedback = {
  score: number;
  out_of: number;
  covered_points: string[];
  missing_points: { point: string; source_page: number | null; figure: string | null }[];
  wording: { yours: string; source_wording: string; page: number | null }[];
  incorrect_claims: { claim: string; correction: string; source_page: number | null }[];
  extra_not_in_source: string[];
  grammar: { original: string; fixed: string; note: string | null }[];
  improved_answer: string;
};

// What the grader returns for a numerical problem (plan 7b). Rows are numbered from 1 in the order of the stored
// answer (see parseRows in math-text.ts). Texts may contain math between dollar signs.
export type ProblemFeedback = {
  kind: "problem";
  score: number;
  out_of: number;
  steps: { row: number; status: "ok" | "wrong" | "unclear"; comment: string | null }[];
  first_wrong_row: number | null;
  final_answer: { expected: string; student: string | null; correct: boolean; units_ok: boolean | null; note: string | null };
  covered_points: string[];
  missing_points: { point: string; source_page: number | null; figure: string | null }[];
  incorrect_claims: { claim: string; correction: string; source_page: number | null }[];
  worked_solution: string;
};

export type Feedback = GradeFeedback | ProblemFeedback;
export const isProblemFeedback = (f: Feedback): f is ProblemFeedback => "kind" in f && f.kind === "problem";

export type QuestionKind = "cq" | "problem";

// A part of a transcription the reader was unsure about (plan 7b). The text is copied from the transcription.
export type UnsurePart = { text: string; reason: string | null };

export type CqQuestion = {
  id: string;
  kind: QuestionKind;
  attempt_id: string;
  position: number;
  text: string;
  marks: number;
  chapter_id: string;
  chapter_number: number;
  figure: SessionFigure | null;
  answered: boolean;
  answer_text: string | null;
  answer_source: "typed" | "photo";
  photos: string[]; // file names of the answer photos, shown through /api/attempts/{attempt}/photos/{file}
  transcribe_job_id: string | null;
  transcribe_status: JobStatus | null;
  transcription: string | null;
  unsure: UnsurePart[];
  seconds_spent: number | null;
  job_id: string | null;
  job_status: JobStatus | null;
  graded: boolean;
  score: number | null;
  feedback: Feedback | null;
};

export type CqSessionInfo = {
  id: string;
  exam_id: string;
  exam_name: string;
  course_name: string;
  course_short: string | null;
  set_id: string | null;
  set_name: string | null;
  finished: boolean;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
};

export type CqSessionPayload = {
  session: CqSessionInfo;
  cap: { used: number; limit: number };
  questions: CqQuestion[];
};

// What GET /api/jobs/{id} returns. Feedback is included once a grading job is done.
export type JobPoll = {
  job: { id: string; kind: string; status: JobStatus; attempts: number; created_at: string; started_at: string | null; finished_at: string | null };
  position: number | null;
  paused?: boolean; // queued while no AI slot is switched on
  score?: number | null;
  feedback?: Feedback | null;
  transcription?: string | null; // a finished reading job carries the text and what it was unsure about
  unsure?: UnsurePart[];
};

// Typed answers skip the "handwriting read" step, so four steps are shown (plan 5c).
export const GRADE_STEPS = ["Answer received", "Matching with your notes", "Checking grammar", "Scoring and feedback"] as const;

// Numerical problems check the calculations instead of the grammar (plan 7b).
export const PROBLEM_STEPS = ["Answer received", "Matching with your notes", "Checking calculations", "Scoring and feedback"] as const;

// Steps shown while the handwriting is read. The marking steps above follow once the student confirms the text.
export const READ_STEPS = ["Photos received", "Reading your handwriting", "Checking the text"] as const;

export type ProgressView = {
  percent: number; // 0 to 100
  doneSteps: number; // how many steps carry a check mark
  activeStep: number; // index of the step in progress, or GRADE_STEPS.length when all are done
  note: string | null; // short line under the active step
};

const EASE_SECONDS = 14; // the bar eases toward 88 percent over roughly this scale
const CEILING = 88;

// The bar is an estimate. Queue position and the start of the job are real, the middle steps are timed.
// While queued the bar creeps from 3 toward 15 percent so it never looks frozen. When no AI slot is switched on
// (paused), the note says so instead of a queue position that will not move.
export function gradingProgress(a: {
  status: JobStatus;
  position: number | null;
  runningMs: number;
  queuedMs?: number;
  paused?: boolean;
  steps?: number;
}): ProgressView {
  const last = a.steps ?? GRADE_STEPS.length;
  if (a.status === "done") return { percent: 100, doneSteps: last, activeStep: last, note: null };
  if (a.status === "queued") {
    const waited = Math.max(0, a.queuedMs ?? 0) / 1000;
    const percent = Math.round(3 + 12 * (1 - Math.exp(-waited / 60)));
    const note = a.paused
      ? "The AI marker is offline right now. Your answer is saved and will be marked when it is back."
      : a.position
        ? `Position in queue #${a.position}`
        : "Waiting for a free slot";
    return { percent, doneSteps: 0, activeStep: 0, note };
  }
  if (a.status === "failed") return { percent: 0, doneSteps: 0, activeStep: 0, note: null };
  const seconds = Math.max(0, a.runningMs) / 1000;
  const percent = Math.max(8, Math.round(CEILING * (1 - Math.exp(-seconds / EASE_SECONDS))));
  const doneSteps = Math.min(1 + (percent >= 30 ? 1 : 0) + (percent >= 62 ? 1 : 0), last - 1);
  return { percent, doneSteps, activeStep: Math.min(doneSteps, last - 1), note: null };
}

// Fraction of the marks, for the colour of the progress segments and the results.
export function markFraction(score: number | null, marks: number) {
  return score === null || marks <= 0 ? 0 : score / marks;
}
