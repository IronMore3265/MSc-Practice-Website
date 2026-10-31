import Link from "@/components/NavLink";
import { FigureCard } from "@/components/FigureCard";
import { ResultActions } from "@/components/ResultActions";
import { ReviewCarousel, type ReviewSlide } from "@/components/ReviewCarousel";
import { SaveReportButton } from "@/components/SaveReportButton";
import { formatDuration, percent, type SessionPayload, type SessionQuestion } from "@/lib/practice";

export type EarlierAttempt = { score: number; max_score: number; started_at: string };

// One question with your answer, the right answer and its note.
function McqReview({ q }: { q: SessionQuestion }) {
  const picked = q.options.find((o) => o.id === q.selected_option_id);
  const right = q.options.find((o) => o.id === q.correct_option_id);
  return (
    <div className="stack-sm">
      <p style={{ whiteSpace: "pre-line" }}>{q.text}</p>
      {q.figure ? <FigureCard figure={q.figure} /> : null}
      <p className="small">
        <span className="label">Your answer</span>
        <br />
        {picked ? `${picked.label}. ${picked.text}` : "Not answered"}
      </p>
      {right && !q.is_correct ? (
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
        {picked && !q.is_correct && q.explanation_selected ? <p className="small muted">Your pick, {picked.label}: {q.explanation_selected}</p> : null}
      </div>
    </div>
  );
}

// Results and weak topics (mockup screen 06), for a finished MCQ session. The answer key is open now, so every
// question can be reviewed: one column, the missed ones in a carousel, then every question in a second carousel.
// The PDF report prints every question in full instead.
export function SessionResult({ payload, earlier }: { payload: SessionPayload; earlier: EarlierAttempt[] }) {
  const { session, questions } = payload;
  const total = questions.reduce((sum, q) => sum + q.marks, 0);
  const score = session.score ?? 0;
  const max = session.max_score ?? total;
  const rightCount = questions.filter((q) => q.is_correct).length;
  const missed = questions.filter((q) => !q.is_correct);
  const seconds =
    session.finished_at ? (new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000 : 0;
  const day = (session.finished_at ?? session.started_at).slice(0, 10);
  const courseLabel = session.course_short ?? session.course_name;

  const chapters = new Map<number, { got: number; of: number }>();
  for (const q of questions) {
    const c = chapters.get(q.chapter_number) ?? { got: 0, of: 0 };
    c.of += q.marks;
    if (q.is_correct) c.got += q.marks;
    chapters.set(q.chapter_number, c);
  }

  const last = earlier[0];
  const samePaper = last ? last.max_score === max : false;
  const delta = last ? (samePaper ? score - last.score : percent(score, max) - percent(last.score, last.max_score)) : null;
  const unit = (n: number) => (samePaper ? `${n} point${n === 1 ? "" : "s"}` : `${n} percentage point${n === 1 ? "" : "s"}`);

  return (
    <main className="shell shell-practice shell-exam">
      <div className="print-only print-head">
        <p className="label">
          Exam Practice <span className="accent">Studio</span> · Report
        </p>
        <p className="label">
          {courseLabel} · {session.exam_name}
          {session.set_name ? ` · ${session.set_name}` : ""} · {day}
        </p>
      </div>

      <div className="between no-print">
        <p className="label">Session result</p>
        <p className="label">
          {session.exam_name} / {courseLabel}
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
              ? `Up ${unit(delta)} from your last attempt on this set (${last.score}/${last.max_score}).`
              : delta < 0
                ? `Down ${unit(Math.abs(delta))} from your last attempt on this set (${last.score}/${last.max_score}).`
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

      {earlier.length > 0 ? (
        <div className="stack-sm no-print">
          <p className="label">Earlier attempts on this set</p>
          <p className="small">{earlier.map((e) => `${e.score}/${e.max_score}`).join(", ")}</p>
        </div>
      ) : null}

      {/* Screen only: the printed report has the full list at the end. */}
      <div className="no-print">
        <ReviewCarousel
          label={missed.length > 0 ? "Missed, review these" : "Nothing missed"}
          empty="Every question was right. Try a new random set for fresh questions."
          slides={missed.map((q) => slideOf(q))}
        />
      </div>

      <div className="no-print">
        <ResultActions setId={session.set_id} sessionId={session.id} chapterIds={chapterIdsOf(payload)} missed={missed.length}>
          <SaveReportButton fileName={`Report ${courseLabel} ${session.exam_name}${session.set_name ? ` ${session.set_name}` : ""} ${day}`} />
        </ResultActions>
      </div>

      <div className="no-print">
        <ReviewCarousel label="All questions and notes" empty="This session has no questions." slides={questions.map((q) => slideOf(q))} />
      </div>

      {/* The report PDF lists every question in full. */}
      <div className="stack print-only">
        <p className="label">All questions and notes</p>
        {questions.map((q) => (
          <div key={q.id} className="card stack-sm review-item">
            <div className="between">
              <span className="row-name">
                Q{q.position + 1} · Chapter {q.chapter_number}
              </span>
              <span className={`chip ${q.is_correct ? "chip-right" : "chip-wrong"}`}>{q.is_correct ? "Right" : q.selected_option_id ? "Wrong" : "Skipped"}</span>
            </div>
            <McqReview q={q} />
          </div>
        ))}
      </div>

      <p className="small muted no-print">
        <Link href="/" className="btn-link">
          Back to the home screen
        </Link>
      </p>
    </main>
  );
}

function chapterIdsOf(payload: SessionPayload) {
  return [...new Set(payload.questions.map((q) => q.chapter_id))];
}

function slideOf(q: SessionQuestion): ReviewSlide {
  return {
    key: q.id,
    title: `Q${q.position + 1}`,
    meta: `Chapter ${q.chapter_number}${q.seconds_spent !== null ? ` · ${formatDuration(q.seconds_spent)}` : ""}`,
    tag: { text: q.is_correct ? "Right" : q.selected_option_id ? "Wrong" : "Skipped", tone: q.is_correct ? ("right" as const) : q.selected_option_id ? ("wrong" as const) : ("muted" as const) },
    content: <McqReview q={q} />,
  };
}
