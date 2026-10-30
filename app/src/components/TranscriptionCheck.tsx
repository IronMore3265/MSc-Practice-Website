"use client";

import { useRef, useState } from "react";
import type { UnsurePart } from "@/lib/cq";

const MAX_CHARS = 8000;

// Photo answers, step two (plan 7b): the text read from the photos, next to the photos, for the student to fix.
// Parts the reader was unsure about are listed as orange chips. Tapping one selects that part in the text box.
// The student's corrected text is what gets marked, never the raw reading.
export function TranscriptionCheck({
  attemptId,
  photos,
  text,
  unsure,
  busy,
  error,
  onText,
  onSubmit,
  onStartOver,
}: {
  attemptId: string;
  photos: string[];
  text: string;
  unsure: UnsurePart[];
  busy: boolean;
  error: string | null;
  onText: (text: string) => void;
  onSubmit: () => void;
  onStartOver: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [big, setBig] = useState<string | null>(null);

  // A part counts as checked once it was tapped or the student changed it (it is no longer in the text).
  const pending = unsure.filter((u) => !seen[u.text] && text.includes(u.text));

  function jump(part: UnsurePart) {
    const ta = box.current;
    if (!ta) return;
    const start = ta.value.indexOf(part.text);
    if (start === -1) return;
    // Blur first so the browser scrolls the selection into view when the box gets focus again.
    ta.blur();
    ta.setSelectionRange(start, start + part.text.length);
    ta.focus();
    setSeen((s) => ({ ...s, [part.text]: true }));
  }

  return (
    <div className="stack-sm">
      <p className="label label-orange">Check what was read</p>
      <p className="small">
        This is what we read from your handwriting. Fix anything that is wrong, because this text is what gets marked.
      </p>

      <div className="photo-grid">
        {photos.map((file, i) => (
          <figure key={file} className="photo-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attempts/${attemptId}/photos/${file}`}
              alt={`Answer photo ${i + 1}`}
              className={big === file ? "photo-img photo-big" : "photo-img"}
              onClick={() => setBig(big === file ? null : file)}
            />
            <figcaption className="small muted">Photo {i + 1}, tap to enlarge</figcaption>
          </figure>
        ))}
      </div>

      {unsure.length > 0 ? (
        <div className="stack-sm">
          <p className="label">{pending.length > 0 ? `${pending.length} part${pending.length === 1 ? "" : "s"} to check` : "All doubtful parts checked"}</p>
          <div className="row-wrap">
            {unsure.map((u) => {
              const done = seen[u.text] || !text.includes(u.text);
              return (
                <button key={u.text} type="button" className={`chip ${done ? "chip-muted" : "chip-now"}`} onClick={() => jump(u)} title={u.reason ?? undefined}>
                  {u.text}
                  {u.reason ? ` (${u.reason})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="field-box">
        <textarea
          ref={box}
          className="input textarea"
          style={{ minHeight: 220 }}
          maxLength={MAX_CHARS}
          value={text}
          disabled={busy}
          aria-label="The text read from your photos"
          onChange={(e) => onText(e.target.value)}
        />
      </div>
      <p className="small muted answer-count">
        {text.length} / {MAX_CHARS}
      </p>
      {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}
      <div className="between">
        <button type="button" className="btn" disabled={busy} onClick={onStartOver}>
          Start over with new photos
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || text.trim().length < 3} onClick={onSubmit}>
          {busy ? "Sending..." : "Looks right, submit for marking"}
        </button>
      </div>
    </div>
  );
}
