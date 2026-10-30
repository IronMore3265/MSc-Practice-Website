"use client";

import { useEffect, useRef } from "react";
import { loadMathLive } from "@/lib/mathlive";
import { parseRows, splitInline, type Row } from "@/lib/math-text";

// One piece of math, drawn read-only with MathLive's own math fonts. Empty until MathLive has loaded.
function MathInline({ latex, display = false }: { latex: string; display?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let gone = false;
    void loadMathLive().then((ml) => {
      const el = host.current;
      if (gone || !el) return;
      const mf = new ml.MathfieldElement();
      mf.readOnly = true;
      mf.mathVirtualKeyboardPolicy = "manual";
      mf.value = display ? `\\displaystyle ${latex}` : latex;
      el.replaceChildren(mf);
    });
    return () => {
      gone = true;
    };
  }, [latex, display]);
  return <span ref={host} className={display ? "math-display" : "math-inline"} role="math" aria-label={latex} />;
}

// A mixed text and math answer (plan 7b) shown row by row. Plain text rows keep their sentences, math between
// single dollar signs becomes a small math box in the line, an equation row is centred.
export function MathRowView({ row }: { row: Row }) {
  return row.kind === "equation" ? (
    <div className="math-eq">
      <MathInline latex={row.value} display />
    </div>
  ) : (
    <p className="math-line">
      {splitInline(row.value).map((s, k) => (s.type === "text" ? <span key={k}>{s.text}</span> : <MathInline key={k} latex={s.latex} />))}
    </p>
  );
}

export function MathText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`math-text${className ? ` ${className}` : ""}`}>
      {parseRows(text).map((r, i) => (
        <MathRowView key={i} row={r} />
      ))}
    </div>
  );
}

// A short text that may hold math in dollar signs (a comment, a corrected value), shown inline.
export function MathInlineText({ text }: { text: string }) {
  return (
    <span>
      {splitInline(text.replace(/\n/g, " ")).map((s, k) => (s.type === "text" ? <span key={k}>{s.text}</span> : <MathInline key={k} latex={s.latex} />))}
    </span>
  );
}
