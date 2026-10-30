// Shapes returned by the get_session and answer_mcq database functions, plus small display helpers.
// Used by server and client code, so nothing here touches the server only modules.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SessionOption = { id: string; label: string; text: string };

export type SessionFigure = { id: string; label: string | null; caption: string | null; page: number; filename: string };

export type SessionQuestion = {
  id: string;
  position: number;
  text: string;
  marks: number;
  chapter_id: string;
  chapter_number: number;
  figure: SessionFigure | null;
  options: SessionOption[];
  answered: boolean;
  selected_option_id: string | null;
  is_correct: boolean | null;
  seconds_spent: number | null;
  // The answer key fields are filled only after the student answered, or when the session is over.
  revealed: boolean;
  source_page: number | null;
  correct_option_id: string | null;
  explanation_correct: string | null;
  explanation_selected: string | null;
};

export type SessionInfo = {
  id: string;
  exam_id: string;
  exam_name: string;
  course_name: string;
  course_short: string | null;
  set_id: string | null;
  set_name: string | null;
  retry_of: string | null;
  finished: boolean;
  timed_out: boolean;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  timed: boolean;
  total_seconds: number;
  seconds_left: number | null;
};

export type SessionPayload = { session: SessionInfo; questions: SessionQuestion[] };

export type AnswerResult =
  | {
      status: "ok";
      is_correct: boolean;
      correct_option_id: string;
      explanation_correct: string | null;
      explanation_selected: string | null;
      source_page: number | null;
      answered: number;
      total: number;
      finished: boolean;
    }
  | { status: "time_up" | "finished" };

// 07:42 style clock for the countdown.
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// "6 min 12 s" or "45 s".
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

type PickableSet = { name: string; chapterId: string | null };

// The sets the home screen offers for the chapters picked. With All, the whole-exam sets. With chapters picked, the
// sets made for those chapters, or, when they have none, the whole-exam sets (narrowed to the picked chapters later).
export function setsForPick<T extends PickableSet>(sets: T[], picked: string[], allPicked: boolean): T[] {
  const chapterSets = allPicked ? [] : sets.filter((s) => s.chapterId !== null && picked.includes(s.chapterId));
  return chapterSets.length ? chapterSets : sets.filter((s) => s.chapterId === null);
}

// With one chapter picked, "Ch 1 Set 2" reads as "Set 2": the chapter is already on screen.
export function setLabel(set: PickableSet, picked: string[]) {
  return picked.length === 1 && set.chapterId ? set.name.replace(/^Ch \d+ /, "") : set.name;
}
