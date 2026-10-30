"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackCards } from "@/components/FeedbackCards";
import { FigureCard } from "@/components/FigureCard";
import { GradingProgress } from "@/components/GradingProgress";
import { SnakeGame } from "@/components/SnakeGame";
import { markFraction, type CqQuestion, type CqSessionPayload, type GradeFeedback, type JobPoll, type JobStatus } from "@/lib/cq";
import { formatClock } from "@/lib/practice";

const POLL_MS = 3000;
const MAX_CHARS = 8000;

type Live = { position: number | null; runningSince: number | null };

// CQ practice with typed answers (mockup screens 03, 05, 07). One question at a time with a stopwatch.
// Submitting saves the answer and queues a grading job. While it runs, the student can play a game or move
// on to the next question. The page polls each waiting job, and every poll also nudges the router (plan 5b).
export function CqPlayer({ initial }: { initial: CqSessionPayload }) {
  const router = useRouter();
  const { session } = initial;
  const [questions, setQuestions] = useState(initial.questions);
  const firstOpen = initial.questions.findIndex((q) => !q.answered);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [live, setLive] = useState<Record<string, Live>>({});
  // Feedback that was already there when the page opened is shown at once. New feedback waits for the "Feedback ready" button.
  const [opened, setOpened] = useState<Record<string, boolean>>(() => Object.fromEntries(initial.questions.filter((q) => q.graded).map((q) => [q.id, true])));
  const [cap, setCap] = useState(initial.cap);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = questions[index];
  const isLast = index === questions.length - 1;
  const answeredCount = questions.filter((x) => x.answered).length;
  const draft = drafts[q.id] ?? "";
  const capReached = cap.used >= cap.limit;

  // Stopwatch: counts up while the question is open and this tab is visible. It is saved with the answer.
  useEffect(() => {
    if (q.answered) return;
    const id = q.id;
    const timer = setInterval(() => {
      if (!document.hidden) setSpent((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, [q.id, q.answered]);

  // Poll every question that is waiting for its grade.
  const waiting = questions.filter((x) => x.job_id && !x.graded && x.job_status !== "failed");
  const waitingKey = waiting.map((x) => `${x.id}:${x.job_id}`).join(",");
  const inFlight = useRef(false);
  useEffect(() => {
    if (!waitingKey) return;
    let stopped = false;
    const pairs = waitingKey.split(",").map((p) => p.split(":") as [string, string]);

    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        for (const [qid, jobId] of pairs) {
          try {
            const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
            if (!res.ok || stopped) continue;
            const data = (await res.json()) as JobPoll;
            const status = data.job.status;
            if (status === "done" && !data.feedback) continue; // wait for the feedback to be readable
            setLive((l) => {
              const prev = l[qid];
              return { ...l, [qid]: { position: data.position, runningSince: status === "running" ? (prev?.runningSince ?? Date.now()) : null } };
            });
            setQuestions((prev) =>
              prev.map((x) =>
                x.id !== qid
                  ? x
                  : status === "done"
                    ? { ...x, job_status: "done" as JobStatus, graded: true, score: data.score ?? data.feedback?.score ?? 0, feedback: data.feedback as GradeFeedback }
                    : { ...x, job_status: status },
              ),
            );
          } catch {
            // Network hiccup: try again on the next beat.
          }
        }
      } finally {
        inFlight.current = false;
      }
    }

    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waitingKey]);

  async function submit() {
    if (busy || q.answered) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cq/${q.id}/grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: session.id, answer: draft, seconds: spent[q.id] ?? 0 }),
      });
      const data = (await res.json()) as { job_id?: string; cap_used?: number; cap_limit?: number; error?: string };
      if (!res.ok || !data.job_id) {
        setError(data.error ?? "Could not submit your answer.");
        return;
      }
      const jobId = data.job_id;
      setQuestions((prev) =>
        prev.map((x) => (x.id === q.id ? { ...x, answered: true, answer_text: draft.trim(), seconds_spent: spent[q.id] ?? 0, job_id: jobId, job_status: "queued" as JobStatus } : x)),
      );
      if (typeof data.cap_used === "number" && typeof data.cap_limit === "number") setCap({ used: data.cap_used, limit: data.cap_limit });
    } catch {
      setError("Network problem. Your answer is still here, try again.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(question: CqQuestion) {
    if (!question.job_id) return;
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${question.job_id}/retry`, { method: "POST" });
      if (!res.ok) {
        setError("Could not retry. Try again in a moment.");
        return;
      }
      setQuestions((prev) => prev.map((x) => (x.id === question.id ? { ...x, job_status: "queued" as JobStatus } : x)));
    } catch {
      setError("Network problem. Try again.");
    }
  }

  async function finish() {
    const open = questions.length - answeredCount;
    if (open > 0 && !window.confirm(`${open} question${open === 1 ? " is" : "s are"} unanswered and will count as zero. Finish now?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/finish`, { method: "POST" });
      if (!res.ok) {
        setError("Could not finish the session. Try again.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem. Try again.");
      setBusy(false);
    }
  }

  function next() {
    if (isLast) void finish();
    else setIndex((i) => i + 1);
  }

  const state = (x: CqQuestion) => (x.graded ? (markFraction(x.score, x.marks) >= 0.5 ? "right" : "wrong") : x.answered ? "wait" : "open");
  const shown = q.answered ? (q.graded && opened[q.id] ? "feedback" : q.job_status === "failed" ? "failed" : "waiting") : "typing";
  const courseLabel = session.course_short ?? session.course_name;
  const seconds = spent[q.id] ?? 0;
  const job: JobStatus = q.graded ? "done" : (q.job_status ?? "queued");

  return (
    <main className="shell shell-practice">
      <div className="between">
        <p className="label">
          {session.exam_name} / CQ · Q {index + 1} / {questions.length}
        </p>
        {shown === "typing" ? (
          <span className="timer-pill" aria-live="off">
            TIME <b>{formatClock(seconds)}</b>
          </span>
        ) : null}
      </div>

      <div className="segments" role="list" aria-label="Questions">
        {questions.map((x, i) => {
          const s = state(x);
          return (
            <button
              key={x.id}
              type="button"
              role="listitem"
              className={`segment segment-${s}${i === index ? " segment-current" : ""}`}
              aria-label={`Question ${i + 1}, ${s === "open" ? "not answered" : s === "wait" ? "being marked" : s === "right" ? "marked, good" : "marked, needs work"}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setIndex(i)}
            />
          );
        })}
      </div>

      <div className="card-orange stack-sm">
        <p className="label label-orange">
          {courseLabel}, Ch {q.chapter_number} · {q.marks} mark{q.marks === 1 ? "" : "s"}
        </p>
        <h1 className="q-text">{q.text}</h1>
      </div>

      {q.figure ? <FigureCard figure={q.figure} /> : null}

      {shown === "typing" ? (
        <>
          <div className="stack-sm">
            <label className="label" htmlFor="cq-answer">
              Your answer
            </label>
            <div className="field-box">
              <textarea
                id="cq-answer"
                className="input textarea"
                style={{ minHeight: 200 }}
                maxLength={MAX_CHARS}
                value={draft}
                disabled={busy}
                onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit();
                }}
                placeholder="Type your answer the way you would write it in the exam."
              />
            </div>
            <p className="small muted answer-count">
              {draft.length} / {MAX_CHARS}
            </p>
          </div>
          <p className="small muted">
            AI gradings used today: {cap.used} of {cap.limit}. {capReached ? "You have none left today, they reset at midnight Bangladesh time." : "Each submit uses one."}
          </p>
          {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}
          <div className="between">
            {!isLast ? (
              <button type="button" className="btn" disabled={busy} onClick={() => setIndex((i) => i + 1)}>
                Skip for now
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-primary" disabled={busy || draft.trim().length < 3 || capReached} onClick={() => void submit()}>
              {busy ? "Sending..." : "Submit for marking"}
            </button>
          </div>
        </>
      ) : null}

      {shown === "waiting" ? (
        <>
          <div className="dashed stack-sm">
            <GradingProgress status={job} position={live[q.id]?.position ?? null} runningSince={live[q.id]?.runningSince ?? null} />
            {q.graded ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setOpened((o) => ({ ...o, [q.id]: true }))}
              >
                Feedback ready, show me
              </button>
            ) : (
              <p className="small muted">You can leave this page. The result is saved with this session. Or go on to the next question while this one is marked.</p>
            )}
          </div>
          <SnakeGame />
        </>
      ) : null}

      {shown === "failed" ? (
        <div className="dashed stack-sm">
          <p className="label label-orange">Marking did not work</p>
          <p className="small">The AI could not mark this answer after three tries. Your answer is saved. Try again, it often works the second time.</p>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => void retry(q)}>
              Retry marking
            </button>
          </div>
        </div>
      ) : null}

      {shown === "feedback" && q.feedback ? <FeedbackCards feedback={q.feedback} chapterNumber={q.chapter_number} answer={q.answer_text} /> : null}

      {error && shown !== "typing" ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

      {shown !== "typing" ? (
        <div className="between">
          <p className="small muted">
            {answeredCount} of {questions.length} answered
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={next}>
            {isLast ? "Finish session" : "Next question"}
          </button>
        </div>
      ) : (
        <div className="between">
          <p className="small muted">
            {answeredCount} of {questions.length} answered
          </p>
          <button type="button" className="btn-link small" disabled={busy} onClick={() => void finish()}>
            End session
          </button>
        </div>
      )}

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
