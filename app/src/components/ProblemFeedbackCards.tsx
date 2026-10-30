import { MathInlineText, MathRowView, MathText } from "@/components/MathText";
import type { ProblemFeedback } from "@/lib/cq";
import { parseRows } from "@/lib/math-text";

const pageNote = (page: number | null) => (page ? `p. ${page}` : null);

// Feedback for a numerical problem (plan 7b): marks, the student's own rows with the first wrong step marked, the
// final answer check, then points and the worked solution. Math is drawn with MathLive's fonts.
export function ProblemFeedbackCards({ feedback, chapterNumber, answer }: { feedback: ProblemFeedback; chapterNumber: number; answer?: string | null }) {
  const f = feedback;
  const rows = answer ? parseRows(answer) : [];
  const byRow = new Map(f.steps.map((s) => [s.row, s]));
  const fa = f.final_answer;

  return (
    <div className="stack-sm">
      <div className="card-orange stack-sm">
        <p className="label label-orange">Marks</p>
        <p className="score-big">
          {f.score}
          <span className="score-of">/{f.out_of}</span>
        </p>
        <p className="small muted">Marked by AI against your Ch {chapterNumber} notes. Method steps, the final answer and units all count. If something looks wrong, check the page it points to.</p>
      </div>

      {rows.length > 0 ? (
        <div className="fb">
          <p className="label">Your working</p>
          {f.first_wrong_row === null ? <p className="small muted">No wrong step was found in your rows.</p> : null}
          <div>
            {rows.map((r, i) => {
              const step = byRow.get(i + 1);
              const wrong = step?.status === "wrong";
              return (
                <div key={i} className={`prow${wrong ? " prow-wrong" : ""}`}>
                  <span className="prow-no">{i + 1}</span>
                  <div>
                    <MathRowView row={r} />
                    {wrong && f.first_wrong_row === i + 1 ? <p className="label label-orange">First wrong step</p> : null}
                    {step?.status === "unclear" ? <p className="label">Unclear</p> : null}
                    {step?.comment ? (
                      <p className="prow-note">
                        <MathInlineText text={step.comment} />
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="fb">
        <p className="label">Final answer</p>
        <p className="small">
          <span className="muted">Correct answer:</span> <MathInlineText text={fa.expected} />
        </p>
        <p className="small">
          <span className="muted">Yours:</span> {fa.student ? <MathInlineText text={fa.student} /> : "not clear in your working"} ·{" "}
          <b className={fa.correct ? undefined : "label-orange"}>{fa.correct ? "Matches" : "Does not match"}</b>
          {fa.units_ok === false ? " · Units are missing or wrong" : fa.units_ok === true ? " · Units are right" : ""}
        </p>
        {fa.note ? (
          <p className="small muted">
            <MathInlineText text={fa.note} />
          </p>
        ) : null}
      </div>

      {f.covered_points.length > 0 ? (
        <div className="fb">
          <p className="label">You got right</p>
          <ul>
            {f.covered_points.map((p, i) => (
              <li key={i}>
                <MathInlineText text={p} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.missing_points.length > 0 ? (
        <div className="fb">
          <p className="label label-orange">Missing points</p>
          <ul>
            {f.missing_points.map((m, i) => (
              <li key={i}>
                <MathInlineText text={m.point} />
                {m.source_page || m.figure ? <span className="muted"> ({[m.figure, pageNote(m.source_page)].filter(Boolean).join(", ")})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.incorrect_claims.length > 0 ? (
        <div className="fb">
          <p className="label">Corrections</p>
          {f.incorrect_claims.map((c, i) => (
            <div key={i} className="fb-pair">
              <span className="fb-old">
                <MathInlineText text={c.claim} />
              </span>
              <span>
                <MathInlineText text={c.correction} />
                {pageNote(c.source_page) ? <span className="muted"> ({pageNote(c.source_page)})</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="dashed stack-sm">
        <p className="label label-orange">Worked solution · with the notes&apos; method</p>
        <MathText text={f.worked_solution} />
      </div>
    </div>
  );
}
