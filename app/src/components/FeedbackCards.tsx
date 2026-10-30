import { ProblemFeedbackCards } from "@/components/ProblemFeedbackCards";
import { isProblemFeedback, type Feedback, type GradeFeedback } from "@/lib/cq";

const pageNote = (page: number | null) => (page ? `p. ${page}` : null);

// CQ feedback (mockup screen 05): each part of the grade is its own card. Orange is only for missing points
// and accents. Page numbers and figure labels were checked against the chapter before they got here.
export function FeedbackCards({ feedback, chapterNumber, answer }: { feedback: Feedback; chapterNumber: number; answer?: string | null }) {
  if (isProblemFeedback(feedback)) return <ProblemFeedbackCards feedback={feedback} chapterNumber={chapterNumber} answer={answer} />;
  return <CqFeedbackCards feedback={feedback} chapterNumber={chapterNumber} answer={answer} />;
}

function CqFeedbackCards({ feedback, chapterNumber, answer }: { feedback: GradeFeedback; chapterNumber: number; answer?: string | null }) {
  const f = feedback;
  const notes = `Ch ${chapterNumber} notes`;
  return (
    <div className="stack-sm">
      <div className="card-orange stack-sm">
        <p className="label label-orange">Marks</p>
        <p className="score-big">
          {f.score}
          <span className="score-of">/{f.out_of}</span>
        </p>
        <p className="small muted">Marked by AI against your {notes}. If something looks wrong, check the page it points to.</p>
      </div>

      {answer ? (
        <details className="fb">
          <summary className="label">Your answer</summary>
          <p className="small pre">{answer}</p>
        </details>
      ) : null}

      {f.covered_points.length > 0 ? (
        <div className="fb">
          <p className="label">You covered</p>
          <ul>
            {f.covered_points.map((p, i) => (
              <li key={i}>{p}</li>
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
                {m.point}
                {m.source_page || m.figure ? (
                  <span className="muted">
                    {" "}
                    ({[m.figure, pageNote(m.source_page)].filter(Boolean).join(", ")})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.wording.length > 0 ? (
        <div className="fb">
          <p className="label">Closer to the notes&apos; wording</p>
          {f.wording.map((w, i) => (
            <div key={i} className="fb-pair">
              <span>
                <span className="muted">You wrote:</span> {w.yours}
              </span>
              <span>
                <span className="muted">The notes say{pageNote(w.page) ? `, ${pageNote(w.page)}` : ""}:</span> {w.source_wording}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {f.incorrect_claims.length > 0 ? (
        <div className="fb">
          <p className="label">Corrections</p>
          {f.incorrect_claims.map((c, i) => (
            <div key={i} className="fb-pair">
              <span className="fb-old">{c.claim}</span>
              <span>
                {c.correction}
                {pageNote(c.source_page) ? <span className="muted"> ({pageNote(c.source_page)})</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {f.extra_not_in_source.length > 0 ? (
        <div className="fb">
          <p className="label">Not in the notes</p>
          <p className="small muted">These points are not in your notes. They are not marked down and add no marks.</p>
          <ul>
            {f.extra_not_in_source.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {f.grammar.length > 0 ? (
        <div className="fb">
          <p className="label">Grammar and spelling</p>
          {f.grammar.map((g, i) => (
            <div key={i} className="fb-pair">
              <span className="fb-old">{g.original}</span>
              <span>
                {g.fixed}
                {g.note ? <span className="muted"> ({g.note})</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="dashed stack-sm">
        <p className="label label-orange">Improved answer · in the notes&apos; wording</p>
        <p className="small pre">{f.improved_answer}</p>
      </div>
    </div>
  );
}
