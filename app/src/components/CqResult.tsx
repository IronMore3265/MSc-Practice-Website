import Link from "@/components/NavLink";
import { FeedbackCards } from "@/components/FeedbackCards";
import { FigureCard } from "@/components/FigureCard";
import { JobWatcher } from "@/components/JobWatcher";
import { RetryJobButton } from "@/components/RetryJobButton";
import { ReviewCarousel } from "@/components/ReviewCarousel";
import { SaveReportButton } from "@/components/SaveReportButton";
import type { CqQuestion, CqSessionPayload } from "@/lib/cq";
import { formatDuration, percent } from "@/lib/practice";

// Results for a finished CQ session (mockup screen 06). Marks that are still being worked on show as such,
// and the page refreshes by itself when they arrive. "Save report PDF" prints every question with its feedback.
export function CqResult({ payload }: { payload: CqSessionPayload }) {
  const { session, questions } = payload;
  const graded = questions.filter((q) => q.graded);
  const pending = questions.filter((q) => q.answered && !q.graded && q.job_status !== "failed");
  const failed = questions.filter((q) => q.answered && !q.graded && q.job_status === "failed");
  const unanswered = questions.filter((q) => !q.answered);
  const total = questions.reduce((sum, q) => sum + q.marks, 0);
  const score = graded.reduce((sum, q) => sum + (q.score ?? 0), 0);
  const seconds = session.finished_at ? (new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000 : 0;
  const day = (session.finished_at ?? session.started_at).slice(0, 10);
  const courseLabel = session.course_short ?? session.course_name;

  const chapters = new Map<number, { got: number; of: number }>();
  for (const q of graded) {
    const c = chapters.get(q.chapter_number) ?? { got: 0, of: 0 };
    c.of += q.marks;
    c.got += q.score ?? 0;
    chapters.set(q.chapter_number, c);
  }

  return (
    <main className="shell shell-practice shell-exam">
      <JobWatcher jobIds={pending.flatMap((q) => (q.job_id ? [q.job_id] : []))} />
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
          <span className="score-of">/{total}</span>
        </p>
        <p className="small muted">
          CQ · {graded.length} of {questions.length} marked · {formatDuration(seconds)}
          {session.set_name ? ` · ${session.set_name}` : ""}
        </p>
        {pending.length > 0 ? <p className="small label-orange">{pending.length} answer{pending.length === 1 ? " is" : "s are"} still being marked. This page updates by itself.</p> : null}
        {failed.length > 0 ? <p className="small">{failed.length} answer{failed.length === 1 ? "" : "s"} could not be marked. Open it under Questions to retry.</p> : null}
        {unanswered.length > 0 ? <p className="small muted">{unanswered.length} question{unanswered.length === 1 ? " was" : "s were"} not answered and count as zero.</p> : null}
      </div>

      {chapters.size > 0 ? (
        <div className="stack-sm">
          <p className="label">Marks by chapter</p>
          {[...chapters.entries()]
            .sort(([a], [b]) => a - b)
            .map(([number, c]) => (
              <div key={number} className="stack-sm">
                <div className="between small">
                  <span className="row-name">Chapter {number}</span>
                  <span>
                    {c.got}/{c.of} · {percent(c.got, c.of)}%
                  </span>
                </div>
                <div className="bar" role="img" aria-label={`Chapter ${number}: ${percent(c.got, c.of)} percent`}>
                  <div className="bar-fill" style={{ width: `${percent(c.got, c.of)}%` }} />
                </div>
              </div>
            ))}
        </div>
      ) : null}

      <div className="no-print">
        <ReviewCarousel
          label="Questions"
          empty="This session has no questions."
          slides={questions.map((q) => ({
            key: q.id,
            title: `Q${q.position + 1}`,
            meta: `Chapter ${q.chapter_number}${q.seconds_spent !== null ? ` · ${formatDuration(q.seconds_spent)}` : ""}`,
            tag: markTag(q),
            content: <CqReview q={q} />,
          }))}
        />
      </div>

      <div className="no-print">
        <SaveReportButton fileName={`Report ${courseLabel} ${session.exam_name}${session.set_name ? ` ${session.set_name}` : ""} ${day}`} />
      </div>

      <div className="stack-sm print-only">
        <p className="label">Questions</p>
        {questions.map((q) => (
          <details key={q.id} className="card" open={failed.length > 0 && failed.includes(q)}>
            <summary className="review-summary">
              <span className="row-name">Q{q.position + 1} ({q.kind === "problem" ? "Problem" : "CQ"})</span>
              <span className="small muted">
                Chapter {q.chapter_number}
                {q.seconds_spent !== null ? ` · ${formatDuration(q.seconds_spent)}` : ""}
                {" · "}
                {q.graded ? `${q.score}/${q.marks}` : q.answered ? (q.job_status === "failed" ? "not marked" : "marking") : "not answered"}
              </span>
            </summary>
            <div style={{ marginTop: 10 }}>
              <CqReview q={q} />
            </div>
          </details>
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

// One question with its answer state and feedback, shared by the carousel and the printed list.
function CqReview({ q }: { q: CqQuestion }) {
  return (
    <div className="stack-sm">
      <p className="pre">{q.text}</p>
      {q.figure ? <FigureCard figure={q.figure} /> : null}
      {q.graded && q.feedback ? (
        <FeedbackCards feedback={q.feedback} chapterNumber={q.chapter_number} answer={q.answer_text} />
      ) : q.answered && q.job_status === "failed" && q.job_id ? (
        <div className="dashed stack-sm">
          <p className="small">The AI could not mark this answer. Your answer is saved.</p>
          <div>
            <RetryJobButton jobId={q.job_id} />
          </div>
        </div>
      ) : q.answered ? (
        <p className="small muted">Still being marked.</p>
      ) : (
        <p className="small muted">You did not answer this question.</p>
      )}
    </div>
  );
}

function markTag(q: CqQuestion): { text: string; tone: "right" | "wrong" | "muted" } {
  if (q.graded) return { text: `${q.score}/${q.marks}`, tone: (q.score ?? 0) * 2 >= q.marks ? "right" : "wrong" };
  if (!q.answered) return { text: "Not answered", tone: "muted" };
  return { text: q.job_status === "failed" ? "Not marked" : "Marking", tone: "muted" };
}
