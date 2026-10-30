// The stored format of a mixed text and math answer (plan section 7b): plain text, math written as LaTeX between
// dollar signs. `$a$` is inline math inside a sentence, `$$a$$` alone on a line is an equation row. One row per line.
// A literal dollar sign in a sentence is written `\$`. Pure functions only, used by the editor, the display and the grader.

export type Segment = { type: "text"; text: string } | { type: "math"; latex: string };
export type Row = { kind: "text" | "equation"; value: string };

// Splits one line into plain text and inline math. An unmatched `$` stays as text. `$$...$$` inside a sentence is
// treated as inline math too, so a model that writes it that way still shows as a math box.
export function splitInline(line: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (ch === "$") {
      const mark = line[i + 1] === "$" ? "$$" : "$";
      let j = i + mark.length;
      let found = -1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line.startsWith(mark, j)) {
          found = j;
          break;
        }
        j++;
      }
      if (found !== -1) {
        const latex = line.slice(i + mark.length, found).trim();
        if (latex) {
          flush();
          out.push({ type: "math", latex });
        }
        i = found + mark.length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// The reverse of splitInline. Empty math is dropped and a `$` in plain text is escaped.
export function joinInline(segments: Segment[]): string {
  return segments
    .map((s) => (s.type === "text" ? s.text.replace(/\$/g, "\\$") : s.latex.trim() ? `$${s.latex.trim()}$` : ""))
    .join("");
}

const EQUATION = /^\$\$(.+)\$\$$/;

// A stored answer as rows. Blank lines are skipped. A line that is one `$$...$$` and nothing else is an equation row.
export function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const eq = EQUATION.exec(line);
    if (eq && !eq[1].includes("$$") && eq[1].trim()) {
      rows.push({ kind: "equation", value: eq[1].trim() });
      continue;
    }
    rows.push({ kind: "text", value: joinInline(splitInline(line)) });
  }
  return rows;
}

// Rows as the stored text. Empty rows are left out, and a row never spans two lines.
export function serializeRows(rows: Row[]): string {
  const lines: string[] = [];
  for (const r of rows) {
    const value = r.value.replace(/\s*\n\s*/g, " ").trim();
    if (!value) continue;
    lines.push(r.kind === "equation" ? `$$${value}$$` : value);
  }
  return lines.join("\n");
}

export const rowCount = (text: string) => parseRows(text).length;

export const hasMath = (text: string) => parseRows(text).some((r) => r.kind === "equation" || splitInline(r.value).some((s) => s.type === "math"));

// A short plain reading of a row, for the lists of low-confidence parts and for aria labels. Math is shown as its LaTeX.
export function plainRow(row: Row): string {
  return row.kind === "equation" ? row.value : splitInline(row.value).map((s) => (s.type === "text" ? s.text : s.latex)).join("");
}
