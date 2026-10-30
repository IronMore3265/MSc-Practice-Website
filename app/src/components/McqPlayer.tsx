"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FigureCard } from "@/components/FigureCard";
import { ChevronLeft, ChevronRight } from "@/components/Icons";
import { formatClock, type AnswerResult, type SessionPayload, type SessionQuestion } from "@/lib/practice";

type Props = { initial: SessionPayload };

// MCQ practice (mockup screen 02). The browser never holds the answer key: the correct option and the
// explanations arrive with the verdict, after the student picks. The countdown starts from the server's
// remaining seconds, and the server is the one that closes the session when time is up.
export function McqPlayer({ initial }: Props) {
  const router = useRouter();
  const { session } = initial;
  const [questions, setQuestions] = useState(initial.questions);
  const firstOpen = initial.questions.findIndex((q) => !q.answered);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(session.seconds_left === null ? null : Math.ceil(session.seconds_left));
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportState, setReportState] = useState<Record<string, "sent" | "sending">>({});

  const q = questions[index];
  const answeredCount = questions.filter((x) => x.answered).length;
  const isLast = index === questions.length - 1;
  const expired = left === 0;

  // After a pick, bring the explanation into view (on phones it sits below the four options).
  const explanation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.answered) explanation.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [q.id, q.answered]);

  // Countdown from the server's remaining seconds.
  useEffect(() => {
    if (session.seconds_left === null) return;
    const end = performance.now() + session.seconds_left * 1000;
    const timer = setInterval(() => setLeft(Math.max(0, Math.ceil((end - performance.now()) / 1000))), 250);
    return () => clearInterval(timer);
  }, [session.seconds_left]);

  // At zero the server closes the session (it also does this by itself on the next load).
  useEffect(() => {
    if (left !== 0) return;
    const timer = setTimeout(async () => {
      await fetch(`/api/sessions/${session.id}/finish`, { method: "POST" }).catch(() => null);
      router.refresh();
    }, 1200);
    return () => clearTimeout(timer);
  }, [left, session.id, router]);

  async function choose(question: SessionQuestion, optionId: string) {
    if (busy || question.answered || expired) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mcq/${question.id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: session.id, option_id: optionId }),
      });
      const data = (await res.json()) as AnswerResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save your answer.");
        return;
      }
      if (data.status !== "ok") {
        router.refresh();
        return;
      }
      setQuestions((prev) =>
        prev.map((x) =>
          x.id === question.id
            ? {
                ...x,
                answered: true,
                revealed: true,
                selected_option_id: optionId,
                is_correct: data.is_correct,
                correct_option_id: data.correct_option_id,
                explanation_correct: data.explanation_correct,
                explanation_selected: data.explanation_selected,
                source_page: data.source_page,
              }
            : x,
        ),
      );
    } catch {
      setError("Network problem. Check your connection and pick again.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const open = questions.length - answeredCount;
    if (open > 0 && !window.confirm(`${open} question${open === 1 ? " is" : "s are"} unanswered and will count as missed. Finish now?`)) return;
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

  function move(step: -1 | 1) {
    setIndex((i) => Math.min(questions.length - 1, Math.max(0, i + step)));
  }

  async function report(question: SessionQuestion) {
    setReportState((s) => ({ ...s, [question.id]: "sending" }));
    try {
      const res = await fetch(`/api/questions/${question.id}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: reportNote }),
      });
      if (!res.ok) throw new Error();
      setReportState((s) => ({ ...s, [question.id]: "sent" }));
      setReportOpen(false);
      setReportNote("");
    } catch {
      setReportState((s) => {
        const copy = { ...s };
        delete copy[question.id];
        return copy;
      });
      setError("Could not send the report. Try again.");
    }
  }

  // Keyboard on laptops: A to D pick an option, the arrow keys move, Enter or N goes on. The handler is renewed after every render.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key === "Enter" && tag === "BUTTON") return; // the focused button handles Enter itself
      const key = e.key.toUpperCase();
      const option = q.options.find((o) => o.label === key);
      if (option && !q.answered) {
        void choose(q, option.id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        move(e.key === "ArrowLeft" ? -1 : 1);
      } else if ((key === "ENTER" || key === "N") && q.answered && !busy) {
        e.preventDefault();
        next();
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const courseLabel = session.course_short ?? session.course_name;
  const lowTime = left !== null && left <= 60;

  return (
    <main className="shell shell-practice">
      <div className="between">
        <p className="label">
          {session.exam_name} / MCQ · Q {index + 1} / {questions.length}
        </p>
        {left !== null ? (
          <span className={`timer-pill${lowTime ? " timer-low" : ""}`} aria-live="off">
            LEFT <b>{formatClock(left)}</b>
          </span>
        ) : null}
      </div>

      <div className="segments" role="list" aria-label="Questions">
        {questions.map((x, i) => {
          const state = !x.answered ? "open" : x.is_correct ? "right" : "wrong";
          return (
            <button
              key={x.id}
              type="button"
              role="listitem"
              className={`segment segment-${state}${i === index ? " segment-current" : ""}`}
              aria-label={`Question ${i + 1}, ${state === "open" ? "not answered" : state === "right" ? "correct" : "wrong"}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => setIndex(i)}
            />
          );
        })}
      </div>

      <div className="card-orange stack-sm">
        <p className="label label-orange">
          {courseLabel}, Ch {q.chapter_number}
          {q.marks > 1 ? ` · ${q.marks} marks` : ""}
        </p>
        <h1 className="q-text">{q.text}</h1>
      </div>

      {q.figure ? <FigureCard figure={q.figure} /> : null}

      <div className="stack" role="group" aria-label="Options">
        {q.options.map((o) => {
          const picked = q.selected_option_id === o.id;
          const isKey = q.revealed && q.correct_option_id === o.id;
          let state = "";
          if (q.answered) {
            if (isKey) state = "opt-correct";
            else if (picked) state = "opt-wrong";
            else state = "opt-dim";
          }
          return (
            <button
              key={o.id}
              type="button"
              className={`opt ${state}`}
              disabled={q.answered || busy || expired}
              aria-pressed={picked}
              onClick={() => void choose(q, o.id)}
            >
              <span className="opt-letter">{o.label}</span>
              <span className="opt-text">{o.text}</span>
            </button>
          );
        })}
      </div>

      {q.answered && q.revealed ? (
        <div className="dashed stack-sm" role="status" ref={explanation}>
          <p className="label label-orange">
            {q.is_correct ? "Correct" : "Why " + (q.options.find((o) => o.id === q.correct_option_id)?.label ?? "")}
            {q.source_page ? ` · Ch ${q.chapter_number} notes, p. ${q.source_page}` : ""}
          </p>
          <p className="small">{q.explanation_correct ?? "No explanation was saved for this question."}</p>
          {!q.is_correct && q.explanation_selected ? (
            <p className="small muted">
              Your pick, {q.options.find((o) => o.id === q.selected_option_id)?.label}: {q.explanation_selected}
            </p>
          ) : null}
        </div>
      ) : null}

      {expired ? <p className="form-msg" data-ok="false">Time is up. Closing your session.</p> : null}
      {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

      <div className="between">
        {reportState[q.id] === "sent" ? (
          <span className="small muted">Reported. Thank you.</span>
        ) : (
          <button type="button" className="btn" onClick={() => setReportOpen((o) => !o)} aria-expanded={reportOpen}>
            Report question
          </button>
        )}
        <div className="nav-buttons">
          <button type="button" className="btn btn-icon" aria-label="Previous question" title="Previous question" disabled={index === 0} onClick={() => move(-1)}>
            <ChevronLeft />
          </button>
          {isLast ? (
            <button type="button" className="btn btn-primary" disabled={busy || expired} onClick={next}>
              Finish
            </button>
          ) : (
            <button type="button" className={`btn btn-icon${q.answered ? " btn-primary" : ""}`} aria-label="Next question" title="Next question" onClick={() => move(1)}>
              <ChevronRight />
            </button>
          )}
        </div>
      </div>

      {reportOpen && reportState[q.id] !== "sent" ? (
        <div className="stack-sm">
          <label className="label" htmlFor="report-note">What is wrong with it? (optional)</label>
          <div className="field-box">
            <input
              id="report-note"
              className="input input-sm"
              maxLength={500}
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="For example: the marked answer looks wrong"
            />
          </div>
          <div className="wrap">
            <button type="button" className="btn btn-small btn-primary" disabled={reportState[q.id] === "sending"} onClick={() => void report(q)}>
              Send report
            </button>
            <button type="button" className="btn btn-small" onClick={() => setReportOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="between">
        <p className="small muted">
          {answeredCount} of {questions.length} answered
        </p>
        {!isLast ? (
          <button type="button" className="btn-link small" disabled={busy} onClick={() => void finish()}>
            End session
          </button>
        ) : null}
      </div>

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
