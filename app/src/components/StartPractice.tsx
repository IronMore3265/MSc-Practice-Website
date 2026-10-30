"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type SetView = {
  id: string;
  name: string;
  mcqByChapter: Record<string, number>;
  attempts: number;
  lastPercent: number | null;
};
export type ExamView = {
  id: string;
  name: string;
  weight: number;
  format: "mcq" | "cq" | "both";
  mcqSeconds: number;
  chapters: { id: string; number: number; title: string }[];
  sets: SetView[];
};
export type CourseView = { id: string; name: string; short: string | null; exams: ExamView[] };

function chapterLabel(exam: ExamView) {
  return exam.chapters.length ? `Ch ${exam.chapters.map((c) => c.number).join(", ")}` : "No chapters yet";
}

function timerLabel(exam: ExamView) {
  return exam.mcqSeconds > 0 ? `${Math.round(exam.mcqSeconds / 60)} min MCQ timer` : "No MCQ timer";
}

// Home screen (mockup screen 01): course, exam, section, chapters, set, then Start.
// MCQ practice is the only section that can be started in this phase. CQ practice arrives later.
export function StartPractice({ courses }: { courses: CourseView[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id);
  const [examIds, setExamIds] = useState<Record<string, string>>({});
  const [chapterPick, setChapterPick] = useState<Record<string, string[]>>({});
  const [setPick, setSetPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"start" | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  if (!course) return <p className="muted">No courses yet. The admin adds them.</p>;
  const exam = course.exams.find((e) => e.id === examIds[course.id]) ?? course.exams[0];

  const allIds = exam ? exam.chapters.map((c) => c.id) : [];
  const picked = exam ? (chapterPick[exam.id] ?? allIds) : [];
  const allPicked = picked.length === allIds.length;
  // Default set: the first one you have not tried yet, else Set 1.
  const set = exam ? (exam.sets.find((s) => s.id === setPick[exam.id]) ?? exam.sets.find((s) => s.attempts === 0) ?? exam.sets[0]) : undefined;
  const mcqCount = set ? picked.reduce((sum, id) => sum + (set.mcqByChapter[id] ?? 0), 0) : 0;
  const playable = !!exam && exam.format !== "cq";

  function toggleChapter(id: string) {
    if (!exam) return;
    // From "All", a tap narrows down to that chapter. After that, taps add or remove chapters, and an empty pick means All again.
    const next = allPicked ? [id] : picked.includes(id) ? picked.filter((c) => c !== id) : [...picked, id];
    setChapterPick({ ...chapterPick, [exam.id]: next.length === 0 ? allIds : next });
  }

  async function newSet() {
    if (!exam) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch(`/api/exams/${exam.id}/sets`, { method: "POST" });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not create a set.");
        return;
      }
      setSetPick({ ...setPick, [exam.id]: data.id });
      startRefresh(() => router.refresh());
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!set) return;
    setBusy("start");
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ set_id: set.id, chapter_ids: allPicked ? undefined : picked }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not start the session.");
        setBusy(null);
        return;
      }
      router.push(`/practice/${data.id}`);
    } catch {
      setError("Network problem. Try again.");
      setBusy(null);
    }
  }

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <p className="label">
          <span className="label-orange">1</span> Course
        </p>
        <div className="wrap">
          {courses.map((c) => (
            <button key={c.id} type="button" className={`pill${c.id === course.id ? " pill-active" : ""}`} aria-pressed={c.id === course.id} onClick={() => setCourseId(c.id)}>
              {c.short ?? c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="stack-sm">
        <p className="label">
          <span className="label-orange">2</span> Exam · {course.name}
        </p>
        {course.exams.length === 0 ? <p className="small muted">No exams in this course yet.</p> : null}
        <div className="stack">
          {course.exams.map((e) => {
            const on = e.id === exam?.id;
            return (
              <button
                key={e.id}
                type="button"
                className={`exam-card${on ? " exam-card-on" : ""}`}
                aria-pressed={on}
                onClick={() => setExamIds({ ...examIds, [course.id]: e.id })}
              >
                <span>
                  <span className="row-name">{e.name}</span>
                  <span className="small exam-card-sub">
                    {chapterLabel(e)} · {e.weight}%
                  </span>
                </span>
                <span className="wrap">
                  {(e.format === "both" ? ["MCQ", "CQ"] : [e.format.toUpperCase()]).map((f) => (
                    <span key={f} className="chip">
                      {f}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {exam && exam.format === "both" ? (
        <div className="stack-sm">
          <p className="label">
            <span className="label-orange">3</span> Section · {exam.name} has both
          </p>
          <div className="wrap">
            <button type="button" className="pill" disabled title="CQ practice is not available yet">
              MCQ + CQ
            </button>
            <button type="button" className="pill pill-active" aria-pressed="true">
              MCQ only
            </button>
            <button type="button" className="pill" disabled title="CQ practice is not available yet">
              CQ only
            </button>
          </div>
          <p className="small muted">CQ practice is not available yet. MCQ practice works now.</p>
        </div>
      ) : null}

      {exam && !playable ? (
        <div className="dashed">
          <p className="small">{exam.name} is descriptive only, and CQ practice is not available yet. Pick an exam with MCQs to practice now.</p>
        </div>
      ) : null}

      {exam && playable ? (
        <>
          <div className="stack-sm">
            <p className="label">
              <span className="label-orange">{exam.format === "both" ? 4 : 3}</span> Chapters · from the {exam.name} syllabus
            </p>
            <div className="wrap">
              <button
                type="button"
                className={`pill${allPicked ? " pill-active" : ""}`}
                aria-pressed={allPicked}
                onClick={() => setChapterPick({ ...chapterPick, [exam.id]: allIds })}
              >
                All
              </button>
              {exam.chapters.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button key={c.id} type="button" className={`pill${on && !allPicked ? " pill-active" : ""}`} aria-pressed={on} title={c.title} onClick={() => toggleChapter(c.id)}>
                    Ch {c.number}
                  </button>
                );
              })}
            </div>
            <p className="small muted">All chapters are used by default. Tap a chapter to narrow down.</p>
          </div>

          <div className="stack-sm">
            <p className="label">
              <span className="label-orange">{exam.format === "both" ? 5 : 4}</span> Set
            </p>
            <div className="wrap">
              {exam.sets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`pill${s.id === set?.id ? " pill-active" : ""}`}
                  aria-pressed={s.id === set?.id}
                  title={s.attempts ? `${s.attempts} attempt${s.attempts === 1 ? "" : "s"}` : "Not tried yet"}
                  onClick={() => setSetPick({ ...setPick, [exam.id]: s.id })}
                >
                  {s.name}
                  {s.lastPercent !== null ? ` · ${s.lastPercent}%` : ""}
                </button>
              ))}
              <button type="button" className="pill" disabled={busy !== null || refreshing} onClick={() => void newSet()}>
                {busy === "new" || refreshing ? "Making a set..." : "+ New random set"}
              </button>
            </div>
            {exam.sets.length === 0 ? <p className="small muted">This exam has no sets yet. Make a random one to start.</p> : null}
            {set ? (
              <p className="small muted">
                {mcqCount} MCQ{mcqCount === 1 ? "" : "s"} in {set.name}
                {allPicked ? "" : " for the chapters you picked"}.
                {set.lastPercent !== null ? ` Last score ${set.lastPercent}%.` : ""}
              </p>
            ) : null}
          </div>

          {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

          <div className="between">
            <p className="label">{timerLabel(exam)}</p>
            <button type="button" className="btn btn-primary" disabled={!set || mcqCount === 0 || busy !== null} onClick={() => void start()}>
              {busy === "start" ? "Starting..." : "Start practice"}
            </button>
          </div>
          {set && mcqCount === 0 ? <p className="small muted">There are no MCQs in this set for the chapters picked. Pick more chapters, another set, or make a new random set.</p> : null}
        </>
      ) : null}
    </section>
  );
}
