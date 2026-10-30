"use client";

import { useEffect, useState } from "react";
import { GRADE_STEPS, gradingProgress, type JobStatus } from "@/lib/cq";

// Staged progress while the answer is marked (mockup screen 07, plan 5c). Queue position and the moment the job
// starts are real. The middle steps are timed to match the single AI call, so the bar is labelled "Estimated".
// When the result arrives the bar fills to 100 in under a second.
export function GradingProgress({ status, position, runningSince }: { status: JobStatus; position: number | null; runningSince: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [status]);

  const view = gradingProgress({ status, position, runningMs: runningSince ? now - runningSince : 0 });

  return (
    <div className="stack-sm">
      <div className="between">
        <p className="label label-orange">{status === "done" ? "Feedback ready" : "Marking your answer"}</p>
        <p className="label">Estimated · {view.percent}%</p>
      </div>
      <div className={`bar bar-estimated${status === "done" ? " bar-fast" : ""}`} role="progressbar" aria-valuenow={view.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Estimated progress">
        <div className="bar-fill" style={{ width: `${view.percent}%` }} />
      </div>
      <div className="steps">
        {GRADE_STEPS.map((name, i) => {
          const done = i < view.doneSteps;
          const active = i === view.activeStep && !done;
          return (
            <div key={name} className={`step${done || active ? "" : " step-wait"}`}>
              <span className="step-name">
                <span>{name}</span>
                {active && view.note ? <span className="small muted">{view.note}</span> : null}
              </span>
              {done ? <span className="chip chip-done">Done</span> : active ? <span className="chip chip-now">Now</span> : <span className="small">Waiting</span>}
              {done ? <span className="pop" aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
