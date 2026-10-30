import Link from "next/link";
import { FigureCard } from "@/components/FigureCard";
import { ResultActions } from "@/components/ResultActions";
import { formatDuration, percent, type SessionPayload } from "@/lib/practice";

export type EarlierAttempt = { score: number; max_score: number; started_at: string };

// Results and weak topics (mockup screen 06), for a finished MCQ session. The answer key is open now,
// so every question can be reviewed. "Save report PDF" arrives in Phase 8.
export function SessionResult({ payload, earlier }: { payload: SessionPayload; earlier: EarlierAttempt[] }) {
  const { session, questions } = payload;
  const total = questions.reduce((sum, q) => sum + q.marks, 0);
  const score = session.score ?? 0;
  const max = session.max_score ?? total;
  const rightCount = questions.filter((q) => q.is_correct).length;
  const missed = questions.filter((q) => !q.is_correct);
  const seconds =
    session.finished_at ? (new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000 : 0;

  const chapters = new Map<number, { got: number; of: number }>();
  for (const q of questions) {
    const c = chapters.get(q.chapter_number) ?? { got: 0, of: 0 };
    c.of += q.marks;
    if (q.is_correct) c.got += q.marks;
    chapters.set(q.chapter_number, c);
  }

  const last = earlier[0];
  const delta = last ? percent(score, max) - percent(last.score, last.max_score) : null;

  return (
    <main className="shell shell-practice">
      <div className="between">
        <p className="label">Session result</p>
        <p className="label">
          {session.exam_name} / {session.course_short ?? session.course_name}
        </p>
      </div>

      <h1 className="title">
        Your <span className="accent">Score</span>
      </h1>

      <div className="card-orange stack-sm">
        <p className="score-big">
          {score}
          <span className="score-of">/{max}</span>
        </p>
        <p className="small muted">
          MCQ {rightCount} of {questions.length} right · {formatDuration(seconds)}
          {session.set_name ? ` · ${session.set_name}` : ""}
          {session.retry_of ? " · retry of missed questions" : ""}
        </p>
        {delta !== null ? (
          <p className="small">
            {delta > 0
              ? `Up ${delta} points from your last attempt on this set (${last.score}/${last.max_score}).`
              : delta < 0
                ? `Down ${Math.abs(delta)} points from your last attempt on this set (${last.score}/${last.max_score}).`
                : `Same as your last attempt on this set (${last.score}/${last.max_score}).`}
          </p>
        ) : null}
        {session.timed_out ? <p className="small label-orange">Time ran out. Unanswered questions count as missed.</p> : null}
      </div>

      <div className="stack-sm">
        <p className="label">Accuracy by chapter</p>
        {[...chapters.entries()]
          .sort(([a], [b]) => a - b)
          .map(([number, c]) => (
            <div key={number} className="stack-sm">
              <div className="between small">
                <span className="row-name">Chapter {number}</span>
                <span>{percent(c.got, c.of)}%</span>
              </div>
              <div className="bar" role="img" aria-label={`Chapter ${number}: ${percent(c.got, c.of)} percent`}>
                <div className="bar-fill" style={{ width: `${percent(c.got, c.of)}%` }} />
              </div>
            </div>
          ))}
      </div>

      <div className="stack-sm">
        <p className="label">{missed.length > 0 ? "Missed, review these" : "Nothing missed"}</p>
        {missed.length === 0 ? <p className="small muted">Every question was right. Try a new random set for fresh questions.</p> : null}
        {missed.map((q) => {
          const picked = q.options.find((o) => o.id === q.selected_option_id);
          const right = q.options.find((o) => o.id === q.correct_option_id);
          return (
            <details key={q.id} className="card">
              <summary className="review-summary">
                <span className="row-name">
                  Q{q.position + 1} (MCQ)
                </span>
                <span className="small muted">
                  Chapter {q.chapter_number}
                  {q.seconds_spent !== null ? ` · ${formatDuration(q.seconds_spent)}` : ""}
                </span>
              </summary>
              <div className="stack-sm" style={{ marginTop: 10 }}>
                <p style={{ whiteSpace: "pre-line" }}>{q.text}</p>
                {q.figure ? <FigureCard figure={q.figure} /> : null}
                <p className="small">
                  <span className="label">Your answer</span>
                  <br />
                  {picked ? `${picked.label}. ${picked.text}` : "Not answered"}
                </p>
                {right ? (
                  <p className="small">
                    <span className="label label-orange">Correct answer</span>
                    <br />
                    {right.label}. {right.text}
                  </p>
                ) : null}
                <div className="dashed stack-sm">
                  <p className="label label-orange">
                    Why{right ? ` ${right.label}` : ""}
                    {q.source_page ? ` · Ch ${q.chapter_number} notes, p. ${q.source_page}` : ""}
                  </p>
                  <p className="small">{q.explanation_correct ?? "No explanation was saved for this question."}</p>
                  {picked && q.explanation_selected ? <p className="small muted">Your pick, {picked.label}: {q.explanation_selected}</p> : null}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {earlier.length > 0 ? (
        <div className="stack-sm">
          <p className="label">Earlier attempts on this set</p>
          <p className="small">{earlier.map((e) => `${e.score}/${e.max_score}`).join(", ")}</p>
        </div>
      ) : null}

      <ResultActions setId={session.set_id} sessionId={session.id} chapterIds={chapterIdsOf(payload)} missed={missed.length} />

      <p className="small muted">
        <Link href="/" className="btn-link">
          Back to the home screen
        </Link>
      </p>
      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}

function chapterIdsOf(payload: SessionPayload) {
  return [...new Set(payload.questions.map((q) => q.chapter_id))];
}
