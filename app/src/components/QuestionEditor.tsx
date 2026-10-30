"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import type { QuestionKind } from "@/lib/database.types";

type Option = { label: string; text: string; is_correct: boolean; explanation: string | null };
type FigureChoice = { id: string; label: string | null; page: number };

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  kind: QuestionKind;
  courseId: string;
  chapterId: string;
  figures: FigureChoice[];
  question?: {
    id: string;
    text: string;
    marks: number;
    source_page: number | null;
    figure_id: string | null;
    answer_notes: string | null;
    status: "draft" | "approved";
  };
  options?: Option[];
  defaultMarks: number;
};

const LABELS = ["A", "B", "C", "D"] as const;

// One form for MCQ, CQ and problem questions. Two buttons: save as a draft, or save and approve.
export function QuestionEditor({ action, kind, courseId, chapterId, figures, question, options, defaultMarks }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [figureId, setFigureId] = useState(question?.figure_id ?? "");
  const byLabel = new Map((options ?? []).map((o) => [o.label, o]));
  const correct = (options ?? []).find((o) => o.is_correct)?.label ?? "";

  return (
    <form action={formAction} className="stack">
      {question ? <input type="hidden" name="id" value={question.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="chapter_id" value={chapterId} />

      <div className="field">
        <label className="label" htmlFor="q-text">Question</label>
        <textarea id="q-text" name="text" className="input textarea" rows={4} defaultValue={question?.text} required />
      </div>

      <div className="inline-form">
        <div className="field">
          <label className="label" htmlFor="q-marks">Marks</label>
          <input id="q-marks" name="marks" inputMode="numeric" className="input input-sm" defaultValue={question?.marks ?? defaultMarks} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="q-page">Source page</label>
          <input id="q-page" name="source_page" inputMode="numeric" className="input input-sm" defaultValue={question?.source_page ?? ""} placeholder="Optional" />
        </div>
        <div className="field" style={{ width: 220 }}>
          <label className="label" htmlFor="q-figure">Figure</label>
          <select id="q-figure" name="figure_id" className="select input-sm" value={figureId} onChange={(e) => setFigureId(e.target.value)}>
            <option value="">No figure</option>
            {figures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label ?? "Figure"} (page {f.page})
              </option>
            ))}
          </select>
        </div>
      </div>

      {figureId ? (
        <div className="figure-card" style={{ maxWidth: 360 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private, login-protected route */}
          <img src={`/api/figures/${figureId}`} alt="Selected figure" />
        </div>
      ) : null}

      {kind === "mcq" ? (
        <div className="stack">
          <p className="label">Options, mark the correct one</p>
          {LABELS.map((label) => {
            const o = byLabel.get(label);
            return (
              <div key={label} className="opt-row">
                <label className="check" title="Correct answer">
                  <input type="radio" name="correct" value={label} defaultChecked={correct === label} required />
                  {label}
                </label>
                <div className="stack-sm grow">
                  <input name={`opt_${label}`} className="input input-sm" defaultValue={o?.text} placeholder={`Option ${label}`} required aria-label={`Option ${label}`} />
                  <input name={`exp_${label}`} className="input input-sm" defaultValue={o?.explanation ?? ""} placeholder="Why this is right or wrong (shown after answering)" aria-label={`Explanation for option ${label}`} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="field">
          <label className="label" htmlFor="q-notes">{kind === "problem" ? "Marking scheme" : "Key points for grading"}</label>
          <textarea
            id="q-notes"
            name="answer_notes"
            className="input textarea"
            rows={kind === "problem" ? 7 : 5}
            defaultValue={question?.answer_notes ?? ""}
            placeholder={
              kind === "problem"
                ? "One step per line: the formula, the substitution, the intermediate steps, then \"Final answer: ... with its unit\". Math goes between dollar signs, for example $z=\\frac{14-10}{2}=2$. Optional, the AI works the problem out from the notes if this is empty."
                : "One point per line, in the wording of the notes (optional)"
            }
          />
        </div>
      )}

      <div className="wrap">
        <button type="submit" name="intent" value="draft" className="btn" disabled={pending}>
          Save as draft
        </button>
        <button type="submit" name="intent" value="approve" className="btn btn-primary" disabled={pending}>
          {pending ? "Working..." : "Save and approve"}
        </button>
        {question ? (
          <span className={`chip ${question.status === "approved" ? "chip-done" : "chip-now"}`}>{question.status === "approved" ? "Approved" : "Draft"}</span>
        ) : null}
      </div>
      {state?.message ? (
        <p className="form-msg" data-ok={state.ok} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
