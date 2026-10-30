"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackCards } from "@/components/FeedbackCards";
import { FigureCard } from "@/components/FigureCard";
import { GradingProgress } from "@/components/GradingProgress";
import { ChevronLeft, ChevronRight } from "@/components/Icons";
import { MathAnswerEditor } from "@/components/MathAnswerEditor";
import { PhotoAnswer } from "@/components/PhotoAnswer";
import { SnakeGame } from "@/components/SnakeGame";
import { TranscriptionCheck } from "@/components/TranscriptionCheck";
import { markFraction, type CqQuestion, type CqSessionPayload, type Feedback, type JobPoll, type JobStatus } from "@/lib/cq";
import { formatClock } from "@/lib/practice";

const POLL_MS = 3000;
const MAX_CHARS = 8000;

type Live = { position: number | null; runningSince: number | null };
type Mode = "type" | "photo";
type Wait = { qid: string; jobId: string; kind: "grade" | "read" };

// CQ and numerical problem practice (mockup screens 03, 04, 05, 07, 11). One question at a time with a stopwatch. The answer is typed, or
// photographed: photos are read by the AI, the student fixes the text, and then it is marked like a typed answer.
// Submitting saves the answer and queues a grading job. While a job runs, the student can play a game or move
// on to the next question. The page polls each waiting job, and every poll also nudges the router (plan 5b).
export function CqPlayer({ initial }: { initial: CqSessionPayload }) {
  const router = useRouter();
  const { session } = initial;
  const [questions, setQuestions] = useState(initial.questions);
  const firstOpen = initial.questions.findIndex((q) => !q.answered);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // The text of a photo answer while the student corrects it. Starts as the reading.
  const [fixes, setFixes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.questions.filter((q) => !q.answered && q.transcription).map((q) => [q.id, q.transcription as string])),
  );
  const [modes, setModes] = useState<Record<string, Mode>>({});
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
  const capReached = cap.used >= cap.limit;
  const mode: Mode = modes[q.id] ?? (q.photos.length > 0 || q.transcribe_job_id ? "photo" : "type");
  const isProblem = q.kind === "problem";
  const draft = drafts[q.id] ?? "";
  const fix = fixes[q.id] ?? q.transcription ?? "";

  const patch = (id: string, change: Partial<CqQuestion>) => setQuestions((prev) => prev.map((x) => (x.id === id ? { ...x, ...change } : x)));

  // Stopwatch: counts up while the question is open and this tab is visible. It is saved with the answer.
  useEffect(() => {
    if (q.answered) return;
    const id = q.id;
    const timer = setInterval(() => {
      if (!document.hidden) setSpent((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, [q.id, q.answered]);

  // Poll every job that is being waited for: a grade for each answered question, a reading for each photo answer
  // that has not come back yet.
  const waiting: Wait[] = questions.flatMap((x) => {
    const list: Wait[] = [];
    if (x.job_id && !x.graded && x.job_status !== "failed") list.push({ qid: x.id, jobId: x.job_id, kind: "grade" });
    if (!x.answered && x.transcribe_job_id && x.transcribe_status !== "failed" && !x.transcription) list.push({ qid: x.id, jobId: x.transcribe_job_id, kind: "read" });
    return list;
  });
  const waitingKey = waiting.map((w) => `${w.qid}:${w.jobId}:${w.kind}`).join(",");
  const inFlight = useRef(false);
  useEffect(() => {
    if (!waitingKey) return;
    let stopped = false;
    const items = waitingKey.split(",").map((p) => p.split(":") as [string, string, "grade" | "read"]);

    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        for (const [qid, jobId, kind] of items) {
          try {
            const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
            if (!res.ok || stopped) continue;
            const data = (await res.json()) as JobPoll;
            const status = data.job.status;
            if (kind === "grade" && status === "done" && !data.feedback) continue; // wait for the feedback to be readable
            if (kind === "read" && status === "done" && !data.transcription) continue; // same for the reading
            setLive((l) => {
              const prev = l[qid];
              return { ...l, [qid]: { position: data.position, runningSince: status === "running" ? (prev?.runningSince ?? Date.now()) : null } };
            });
            if (kind === "read") {
              if (status === "done" && data.transcription) {
                const text = data.transcription;
                setFixes((f) => (f[qid] === undefined ? { ...f, [qid]: text } : f));
                setQuestions((prev) => prev.map((x) => (x.id === qid ? { ...x, transcribe_status: "done" as JobStatus, transcription: text, unsure: data.unsure ?? [] } : x)));
              } else {
                setQuestions((prev) => prev.map((x) => (x.id === qid ? { ...x, transcribe_status: status } : x)));
              }
              continue;
            }
            setQuestions((prev) =>
              prev.map((x) =>
                x.id !== qid
                  ? x
                  : status === "done"
                    ? { ...x, job_status: "done" as JobStatus, graded: true, score: data.score ?? data.feedback?.score ?? 0, feedback: data.feedback as Feedback }
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

  async function submit(text: string) {
    if (busy || q.answered) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cq/${q.id}/grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: session.id, answer: text, seconds: spent[q.id] ?? 0 }),
      });
      const data = (await res.json()) as { job_id?: string; cap_used?: number; cap_limit?: number; error?: string };
      if (!res.ok || !data.job_id) {
        setError(data.error ?? "Could not submit your answer.");
        return;
      }
      patch(q.id, {
        answered: true,
        answer_text: text.trim(),
        answer_source: q.transcribe_job_id ? "photo" : "typed",
        seconds_spent: spent[q.id] ?? 0,
        job_id: data.job_id,
        job_status: "queued" as JobStatus,
      });
      if (typeof data.cap_used === "number" && typeof data.cap_limit === "number") setCap({ used: data.cap_used, limit: data.cap_limit });
    } catch {
      setError("Network problem. Your answer is still here, try again.");
    } finally {
      setBusy(false);
    }
  }

  // Ask for the handwriting on the attached photos to be read.
  async function startReading() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cq/${q.id}/transcribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: session.id }),
      });
      const data = (await res.json()) as { job_id?: string; cap_used?: number; cap_limit?: number; error?: string };
      if (!res.ok || !data.job_id) {
        setError(data.error ?? "Could not start reading your photos.");
        return;
      }
      patch(q.id, { transcribe_job_id: data.job_id, transcribe_status: "queued" as JobStatus, transcription: null, unsure: [] });
      if (typeof data.cap_used === "number" && typeof data.cap_limit === "number") setCap({ used: data.cap_used, limit: data.cap_limit });
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Forget the photos and the reading so new photos can be taken (or the answer typed instead).
  async function startOver() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cq/${q.id}/photos`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: session.id, all: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not start over. Try again.");
        return;
      }
      patch(q.id, { photos: [], transcribe_job_id: null, transcribe_status: null, transcription: null, unsure: [] });
      setFixes((f) => {
        const { [q.id]: _gone, ...rest } = f;
        void _gone;
        return rest;
      });
      setLive((l) => {
        const { [q.id]: _gone, ...rest } = l;
        void _gone;
        return rest;
      });
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(jobId: string | null, id: string, kind: "grade" | "read") {
    if (!jobId) return;
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      if (!res.ok) {
        setError("Could not retry. Try again in a moment.");
        return;
      }
      patch(id, kind === "read" ? { transcribe_status: "queued" as JobStatus } : { job_status: "queued" as JobStatus });
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

  // What the screen shows for this question. Unanswered: type, photos, reading, readfail or check. Answered: waiting, failed or feedback.
  const shown = q.answered
    ? q.graded && opened[q.id]
      ? "feedback"
      : q.job_status === "failed"
        ? "failed"
        : "waiting"
    : mode === "type"
      ? "typing"
      : !q.transcribe_job_id
        ? "photos"
        : q.transcribe_status === "failed"
          ? "readfail"
          : q.transcription
            ? "check"
            : "reading";
  const open = !q.answered;
  const courseLabel = session.course_short ?? session.course_name;
  const seconds = spent[q.id] ?? 0;
  const job: JobStatus = q.graded ? "done" : (q.job_status ?? "queued");
  const readJob: JobStatus = q.transcribe_status ?? "queued";
  const canSwitchMode = open && !q.transcribe_job_id && !busy;

  return (
    <main className="shell shell-practice">
      <div className="between">
        <p className="label">
          {session.exam_name} / {isProblem ? "Problem" : "CQ"} · Q {index + 1} / {questions.length}
        </p>
        {open ? (
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

      {open && !q.transcribe_job_id ? (
        <div className="row-wrap" role="group" aria-label="How do you want to answer?">
          <button type="button" className={`pill${mode === "type" ? " pill-active" : ""}`} aria-pressed={mode === "type"} disabled={!canSwitchMode} onClick={() => setModes((m) => ({ ...m, [q.id]: "type" }))}>
            Type
          </button>
          <button type="button" className={`pill${mode === "photo" ? " pill-active" : ""}`} aria-pressed={mode === "photo"} disabled={!canSwitchMode} onClick={() => setModes((m) => ({ ...m, [q.id]: "photo" }))}>
            Photo
          </button>
        </div>
      ) : null}

      {shown === "typing" ? (
        <>
          {isProblem ? (
            <div className="stack-sm">
              <p className="label">Your working</p>
              <MathAnswerEditor
                key={q.id}
                value={draft}
                disabled={busy}
                onChange={(text) => setDrafts((d) => (d[q.id] === text || (!text && d[q.id] === undefined) ? d : { ...d, [q.id]: text }))}
              />
            </div>
          ) : (
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
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit(draft);
                  }}
                  placeholder="Type your answer the way you would write it in the exam."
                />
              </div>
              <p className="small muted answer-count">
                {draft.length} / {MAX_CHARS}
              </p>
            </div>
          )}
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
            <button type="button" className="btn btn-primary" disabled={busy || draft.trim().length < 3 || draft.length > MAX_CHARS || capReached} onClick={() => void submit(draft)}>
              {busy ? "Sending..." : "Submit for marking"}
            </button>
          </div>
        </>
      ) : null}

      {shown === "photos" ? (
        <>
          <PhotoAnswer
            sessionId={session.id}
            questionId={q.id}
            attemptId={q.attempt_id}
            photos={q.photos}
            disabled={busy}
            capReached={capReached}
            onPhotos={(photos) => patch(q.id, { photos })}
            onRead={() => void startReading()}
          />
          <p className="small muted">AI gradings used today: {cap.used} of {cap.limit}.</p>
          {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}
          {!isLast ? (
            <div>
              <button type="button" className="btn" disabled={busy} onClick={() => setIndex((i) => i + 1)}>
                Skip for now
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {shown === "reading" ? (
        <>
          <div className="dashed stack-sm">
            <GradingProgress kind="read" status={readJob} position={live[q.id]?.position ?? null} runningSince={live[q.id]?.runningSince ?? null} />
            <p className="small muted">Your photos are being read. Next you can check the text before it is marked. You can go on to another question meanwhile.</p>
          </div>
          <SnakeGame />
        </>
      ) : null}

      {shown === "readfail" ? (
        <div className="dashed stack-sm">
          <p className="label label-orange">Reading did not work</p>
          <p className="small">The photos could not be read after three tries. Try again, or start over with clearer photos (good light, page flat, writing in dark ink). A failed reading does not use up a grading.</p>
          <div className="row-wrap">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void retry(q.transcribe_job_id, q.id, "read")}>
              Try reading again
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void startOver()}>
              Start over with new photos
            </button>
          </div>
          {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}
        </div>
      ) : null}

      {shown === "check" ? (
        <TranscriptionCheck
          key={`${q.id}-${q.transcribe_job_id}`}
          attemptId={q.attempt_id}
          photos={q.photos}
          text={fix}
          unsure={q.unsure}
          problem={isProblem}
          busy={busy}
          error={error}
          onText={(text) => setFixes((f) => ({ ...f, [q.id]: text }))}
          onSubmit={() => void submit(fix)}
          onStartOver={() => void startOver()}
        />
      ) : null}

      {shown === "waiting" ? (
        <>
          <div className="dashed stack-sm">
            <GradingProgress status={job} problem={isProblem} position={live[q.id]?.position ?? null} runningSince={live[q.id]?.runningSince ?? null} />
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
            <button type="button" className="btn btn-primary" onClick={() => void retry(q.job_id, q.id, "grade")}>
              Retry marking
            </button>
          </div>
        </div>
      ) : null}

      {shown === "feedback" && q.feedback ? <FeedbackCards feedback={q.feedback} chapterNumber={q.chapter_number} answer={q.answer_text} /> : null}

      {error && !open ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

      <div className="between">
        <p className="small muted">
          {answeredCount} of {questions.length} answered
        </p>
        <div className="nav-buttons">
          {open ? (
            <button type="button" className="btn-link small" disabled={busy} onClick={() => void finish()}>
              End session
            </button>
          ) : null}
          <button type="button" className="btn btn-icon" aria-label="Previous question" title="Previous question" disabled={busy || index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            <ChevronLeft />
          </button>
          {!isLast ? (
            <button type="button" className={`btn btn-icon${open ? "" : " btn-primary"}`} aria-label="Next question" title="Next question" disabled={busy} onClick={next}>
              <ChevronRight />
            </button>
          ) : !open ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={next}>
              Finish session
            </button>
          ) : null}
        </div>
      </div>

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
