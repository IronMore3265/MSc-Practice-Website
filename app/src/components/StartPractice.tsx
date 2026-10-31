"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DotIcon } from "@/components/DotIcons";
import { ExamBriefing } from "@/components/ExamBriefing";
import { Leaderboard } from "@/components/Leaderboard";
import { setLabel, setsForPick } from "@/lib/practice";

export type SetView = {
  id: string;
  name: string;
  // Set for one chapter only ("Ch 1 Set 2"), or null for a whole-exam set ("Set 2").
  chapterId: string | null;
  mcqByChapter: Record<string, number>;
  cqByChapter: Record<string, number>;
  mcqMarksByChapter: Record<string, number>;
  cqMarksByChapter: Record<string, number>;
  attempts: number;
  cqAttempts: number;
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
export type SemesterView = { id: string; name: string; courses: CourseView[] };
export type GradeCap = { used: number; limit: number };
type Section = "mcq" | "cq";

function chapterLabel(exam: ExamView) {
  return exam.chapters.length ? `Ch ${exam.chapters.map((c) => c.number).join(", ")}` : "No chapters yet";
}

function timerLabel(exam: ExamView, section: Section) {
  if (section === "cq") return "Stopwatch for each CQ";
  return exam.mcqSeconds > 0 ? `${Math.round(exam.mcqSeconds / 60)} min MCQ timer` : "No MCQ timer";
}

type Props = {
  semesters: SemesterView[];
  cap: GradeCap;
  // Server-rendered panels for the side column (the invite panel).
  side: ReactNode;
  leaderboard: { on: boolean; joined: boolean };
};

// Home screen (mockup screen 01): semester, course, exam, section, chapters, set, then Start and a briefing.
// MCQ and CQ run as separate sessions. "MCQ + CQ" in one go is not built yet, so it stays switched off.
// Laptop: picker on the left, side column on the right. Phone: one column. The leaderboard follows the picked exam.
export function StartPractice({ semesters, cap, side, leaderboard }: Props) {
  const router = useRouter();
  // Newest semester first by default (the last one by sort order).
  const [semesterId, setSemesterId] = useState(semesters[semesters.length - 1]?.id);
  const [courseIds, setCourseIds] = useState<Record<string, string>>({});
  const [examIds, setExamIds] = useState<Record<string, string>>({});
  const [chapterPick, setChapterPick] = useState<Record<string, string[]>>({});
  const [setPick, setSetPick] = useState<Record<string, string>>({});
  const [sectionPick, setSectionPick] = useState<Record<string, Section>>({});
  const [busy, setBusy] = useState<"start" | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The briefing belongs to one pick. Changing any picker above closes it.
  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const semester = semesters.find((s) => s.id === semesterId) ?? semesters[semesters.length - 1];
  if (!semester)
    return (
      <div className="dash-grid">
        <p className="muted">No semesters are open yet. The admin adds them.</p>
        <aside className="dash-side stack">{side}</aside>
      </div>
    );
  const courses = semester.courses;
  const course = courses.find((c) => c.id === courseIds[semester.id]) ?? courses[0];
  const exam = course?.exams.find((e) => e.id === examIds[course.id]) ?? course?.exams[0];

  const allIds = exam ? exam.chapters.map((c) => c.id) : [];
  const picked = exam ? (chapterPick[exam.id] ?? allIds) : [];
  const allPicked = picked.length === allIds.length;
  // An MCQ-only or CQ-only exam has one section. An exam with both lets you pick, MCQ first.
  const section: Section = exam ? (exam.format === "cq" ? "cq" : exam.format === "mcq" ? "mcq" : (sectionPick[exam.id] ?? "mcq")) : "mcq";
  // Only the sets that hold questions for that section, so an MCQ-only set is not offered for CQ practice or the other way round.
  const sectionSets = exam ? exam.sets.filter((s) => Object.keys(section === "cq" ? s.cqByChapter : s.mcqByChapter).length > 0) : [];
  const sets = exam ? setsForPick(sectionSets, picked, allPicked) : [];
  // Default set: the first one you have not tried yet, else the first one.
  const set = exam ? (sets.find((s) => s.id === setPick[exam.id]) ?? sets.find((s) => s.attempts === 0) ?? sets[0]) : undefined;
  const counts = set ? (section === "cq" ? set.cqByChapter : set.mcqByChapter) : {};
  const questionCount = picked.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
  const marksByChapter = set ? (section === "cq" ? set.cqMarksByChapter : set.mcqMarksByChapter) : {};
  const marks = picked.reduce((sum, id) => sum + (marksByChapter[id] ?? 0), 0);
  const noun = section === "cq" ? "CQ" : "MCQ";
  const capLeft = Math.max(0, cap.limit - cap.used);
  const pickKey = `${set?.id}|${section}|${picked.join(",")}`;
  const briefing = briefFor === pickKey;

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
      // With one chapter picked, the new set is for that chapter only.
      const chapterId = !allPicked && picked.length === 1 ? picked[0] : undefined;
      const res = await fetch(`/api/exams/${exam.id}/sets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
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
        body: JSON.stringify({ set_id: set.id, section, chapter_ids: allPicked ? undefined : picked }),
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
    <div className="dash-grid">
      <section className="stack" style={{ gap: 22 }}>
        <div className="stack-sm">
          <p className="label">
            <DotIcon name="semester" />
            Semester
          </p>
          <div className="wrap">
            {semesters.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pill${s.id === semester.id ? " pill-active" : ""}`}
                aria-pressed={s.id === semester.id}
                onClick={() => setSemesterId(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="stack-sm">
          <p className="label">
            <DotIcon name="course" />
            Course · {semester.name}
          </p>
          {courses.length === 0 ? <p className="small muted">No courses in this semester yet.</p> : null}
          <div className="wrap">
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`pill${c.id === course?.id ? " pill-active" : ""}`}
                aria-pressed={c.id === course?.id}
                onClick={() => setCourseIds({ ...courseIds, [semester.id]: c.id })}
              >
                {c.short ?? c.name}
              </button>
            ))}
          </div>
        </div>

        {course ? (
          <div className="stack-sm">
            <p className="label">
              <DotIcon name="exam" />
              Exam · {course.name}
            </p>
            {course.exams.length === 0 ? <p className="small muted">No exams in this course yet.</p> : null}
            <div className="exam-grid">
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
        ) : null}

        {exam && exam.format === "both" ? (
          <div className="stack-sm">
            <p className="label">
              <DotIcon name="section" />
              Section · {exam.name} has both
            </p>
            <div className="wrap">
              <button type="button" className="pill" disabled title="Not available yet. Do the MCQ part, then the CQ part.">
                MCQ + CQ
              </button>
              <button type="button" className={`pill${section === "mcq" ? " pill-active" : ""}`} aria-pressed={section === "mcq"} onClick={() => setSectionPick({ ...sectionPick, [exam.id]: "mcq" })}>
                MCQ only
              </button>
              <button type="button" className={`pill${section === "cq" ? " pill-active" : ""}`} aria-pressed={section === "cq"} onClick={() => setSectionPick({ ...sectionPick, [exam.id]: "cq" })}>
                CQ only
              </button>
            </div>
            <p className="small muted">Do the MCQ part and the CQ part one after the other. Doing both in one session is not available yet.</p>
          </div>
        ) : null}

        {exam ? (
          <>
            <div className="stack-sm">
              <p className="label">
                <DotIcon name="chapters" />
                Chapters · from the {exam.name} syllabus
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
                <DotIcon name="set" />
                Set
              </p>
              <div className="wrap">
                {sets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`pill${s.id === set?.id ? " pill-active" : ""}`}
                    aria-pressed={s.id === set?.id}
                    title={s.attempts ? `${s.attempts} attempt${s.attempts === 1 ? "" : "s"}` : "Not tried yet"}
                    onClick={() => setSetPick({ ...setPick, [exam.id]: s.id })}
                  >
                    {setLabel(s, picked)}
                    {s.lastPercent !== null ? ` · ${s.lastPercent}%` : ""}
                  </button>
                ))}
                <button type="button" className="pill" disabled={busy !== null || refreshing} onClick={() => void newSet()}>
                  {busy === "new" || refreshing ? "Making a set..." : "+ New random set"}
                </button>
              </div>
              {sets.length === 0 ? <p className="small muted">{allPicked ? "This exam has" : "The chapters you picked have"} no sets yet. Make a random one to start.</p> : null}
              {set ? (
                <p className="small muted">
                  {questionCount} {noun}{questionCount === 1 ? "" : "s"} in {setLabel(set, picked)}
                  {allPicked || set.chapterId ? "" : " for the chapters you picked"}.
                  {section === "mcq" && set.lastPercent !== null ? ` Last score ${set.lastPercent}%.` : ""}
                  {section === "cq" && set.cqAttempts > 0 ? ` Tried ${set.cqAttempts} time${set.cqAttempts === 1 ? "" : "s"}.` : ""}
                </p>
              ) : null}
            </div>

            {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

            {briefing ? (
              <ExamBriefing
                section={section}
                title={`${exam.name} / ${noun}${set ? ` · ${setLabel(set, picked)}` : ""}`}
                questionCount={questionCount}
                marks={marks}
                mcqSeconds={exam.mcqSeconds}
                capLeft={capLeft}
                capLimit={cap.limit}
                busy={busy === "start"}
                onBegin={() => void start()}
                onBack={() => setBriefFor(null)}
              />
            ) : (
              <div className="between">
                <p className="label">{timerLabel(exam, section)}</p>
                <button type="button" className="btn btn-primary" disabled={!set || questionCount === 0 || busy !== null} onClick={() => setBriefFor(pickKey)}>
                  Start practice
                </button>
              </div>
            )}
            {section === "cq" ? (
              <p className="small muted">
                Each CQ is marked by AI and uses one of your daily gradings. {capLeft} of {cap.limit} left today.
              </p>
            ) : null}
            {set && questionCount === 0 ? <p className="small muted">There are no {noun}s in this set for the chapters picked. Pick more chapters, another set, or make a new random set.</p> : null}
          </>
        ) : null}
      </section>
      <aside className="dash-side stack">
        {side}
        {leaderboard.on && exam ? <Leaderboard examId={exam.id} examName={exam.name} joined={leaderboard.joined} /> : null}
      </aside>
    </div>
  );
}
