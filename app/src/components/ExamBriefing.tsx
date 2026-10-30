"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "@/components/Icons";

type Props = {
  section: "mcq" | "cq";
  title: string;
  questionCount: number;
  marks: number;
  mcqSeconds: number;
  capLeft: number;
  capLimit: number;
  busy: boolean;
  onBegin: () => void;
  onBack: () => void;
};

// Shown after "Start practice" and before the session exists, so the MCQ timer only starts on "Begin".
// The colour key uses the same classes as the practice screen, so it looks exactly like what comes next.
export function ExamBriefing({ section, title, questionCount, marks, mcqSeconds, capLeft, capLimit, busy, onBegin, onBack }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const mcq = section === "mcq";
  const minutes = Math.round(mcqSeconds / 60);
  const noun = mcq ? "MCQ" : "CQ";

  return (
    <div className="card-shadow stack brief" ref={box} role="region" aria-label="Before you start">
      <div className="between">
        <p className="label label-orange">Before you start</p>
        <p className="label">{title}</p>
      </div>

      <div className="brief-grid">
        <div className="stack-sm">
          <p className="label">Questions</p>
          <p className="small">
            {questionCount} {noun}
            {questionCount === 1 ? "" : "s"}, {marks} mark{marks === 1 ? "" : "s"} in total.
          </p>
        </div>
        <div className="stack-sm">
          <p className="label">Time</p>
          <p className="small">
            {mcq
              ? mcqSeconds > 0
                ? `${minutes} min. The clock starts when you press Begin. At zero the session closes and unanswered questions count as missed.`
                : "No time limit."
              : "A stopwatch for each CQ, no time limit. Take the time you would take in the exam."}
          </p>
        </div>
      </div>

      <div className="stack-sm">
        <p className="label">How it is marked</p>
        {mcq ? (
          <ul className="brief-list small">
            <li>A right pick earns the marks of that question.</li>
            <li>A wrong pick or a skipped question earns 0. There is no negative marking.</li>
            <li>The answer and its note show right after each pick. All notes are listed again at the end.</li>
          </ul>
        ) : (
          <ul className="brief-list small">
            <li>The AI marks each answer against the chapter notes, out of the marks of that question.</li>
            <li>You get covered points, missing points, corrections and an improved answer.</li>
            <li>
              Each submit uses one daily grading. {capLeft} of {capLimit} left today.
            </li>
          </ul>
        )}
      </div>

      <div className="stack-sm">
        <p className="label">Colour key</p>
        {mcq ? (
          <div className="brief-keys">
            <div className="opt opt-key opt-correct" aria-hidden="true">
              <span className="opt-letter">B</span>
            </div>
            <span className="small">Correct answer</span>
            <div className="opt opt-key opt-wrong" aria-hidden="true">
              <span className="opt-letter">C</span>
            </div>
            <span className="small">Your pick, when it is wrong</span>
            <div className="opt opt-key opt-dim" aria-hidden="true">
              <span className="opt-letter">A</span>
            </div>
            <span className="small">The other options</span>
          </div>
        ) : null}
        <div className="brief-keys">
          <span className="segment segment-key segment-right" aria-hidden="true" />
          <span className="small">{mcq ? "Progress bar: right" : "Progress bar: half marks or more"}</span>
          <span className="segment segment-key segment-wrong" aria-hidden="true" />
          <span className="small">{mcq ? "Wrong" : "Under half marks"}</span>
          {mcq ? null : (
            <>
              <span className="segment segment-key segment-wait" aria-hidden="true" />
              <span className="small">Being marked</span>
            </>
          )}
          <span className="segment segment-key" aria-hidden="true" />
          <span className="small">Not answered yet</span>
          <span className="segment segment-key segment-current" aria-hidden="true" />
          <span className="small">Underlined: the question you are on</span>
        </div>
      </div>

      <div className="stack-sm">
        <p className="label">Moving around</p>
        <p className="small brief-move">
          <span className="btn btn-icon btn-key" aria-hidden="true">
            <ChevronLeft />
          </span>
          <span className="btn btn-icon btn-key" aria-hidden="true">
            <ChevronRight />
          </span>
          Previous and next question. Tap a bar segment to jump.
          {mcq ? " On a laptop, keys A to D pick and the arrow keys move." : ""}
        </p>
      </div>

      <div className="between">
        <button type="button" className="btn" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onBegin} autoFocus>
          {busy ? "Starting..." : "Begin"}
        </button>
      </div>
    </div>
  );
}
