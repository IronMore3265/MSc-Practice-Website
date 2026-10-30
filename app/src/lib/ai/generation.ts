// Question generation: the prompt, the JSON shape asked of Gemini, and strict checking of what comes back.
// Pure functions only. Nothing here calls the API or the database.

export type GenKind = "mcq" | "cq" | "problem";
export type PageText = { page: number; text: string };
export type FigureRef = { id: string; label: string | null; page: number };

export type CleanOption = { label: "A" | "B" | "C" | "D"; text: string; is_correct: boolean; explanation: string | null };
export type CleanQuestion = {
  kind: GenKind;
  text: string;
  marks: number;
  source_page: number | null;
  figure_id: string | null;
  answer_notes: string | null;
  options: CleanOption[]; // empty for CQ
};

export const MAX_CHAPTER_CHARS = 700_000;
export const MAX_GENERATE_COUNT = 15;

// JSON schema given to Gemini as responseJsonSchema.
export const GENERATION_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          source_page: { type: "integer", nullable: true },
          figure_label: { type: "string", nullable: true },
          options: {
            type: "array",
            nullable: true,
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                is_correct: { type: "boolean" },
                explanation: { type: "string" },
              },
              required: ["text", "is_correct", "explanation"],
            },
          },
          key_points: {
            type: "array",
            nullable: true,
            items: {
              type: "object",
              properties: { point: { type: "string" }, source_page: { type: "integer", nullable: true } },
              required: ["point"],
            },
          },
        },
        required: ["text"],
      },
    },
  },
  required: ["questions"],
} as const;

export function chapterText(pages: PageText[]): string {
  let out = "";
  for (const p of pages) {
    const block = `[Page ${p.page}]\n${p.text.trim()}\n\n`;
    if (out.length + block.length > MAX_CHAPTER_CHARS) break;
    out += block;
  }
  return out.trim();
}

export function buildPrompt(a: {
  courseName: string;
  chapterNumber: number;
  chapterTitle: string;
  kind: GenKind;
  count: number;
  marks: number;
  pages: PageText[];
  figures: FigureRef[];
  existing: string[];
}): { system: string; user: string } {
  const kindRules =
    a.kind === "mcq"
      ? [
          `Write ${a.count} multiple choice questions. Each has exactly four options. Exactly one option is correct.`,
          "Make the wrong options plausible, based on real ideas from the chapter, not silly. Keep all options a similar length.",
          "For every option give a short explanation: for the correct one say why it is right, for each wrong one say why it is wrong. Never refer to options by letter inside an explanation.",
          'Do not write "all of the above" or "none of the above". Do not use negative wording such as "which is NOT" unless it is the clearest way to ask.',
          "Leave key_points out.",
        ]
      : a.kind === "problem"
        ? [
            `Write ${a.count} numerical problems worth ${a.marks} marks each, the kind a lecturer sets for a written paper: a short scenario with all the data given, and a clear question to calculate or find.`,
            "Each problem must be solvable by hand with the formulas, definitions and tables in the chapter text. Give every number the solution needs in the problem text, or name the table or figure that supplies it. Use LaTeX between single dollar signs for any formula or symbol in the question, for example $\\mu=10$.",
            `For each, give key_points as the marking scheme: the formula to use, the substitution, the intermediate steps, the final answer with its unit (write it as "Final answer: ..."), and the page each comes from. About ${Math.max(3, Math.min(a.marks + 2, 8))} lines.`,
            "Leave options out.",
          ]
        : [
          `Write ${a.count} descriptive questions worth ${a.marks} marks each, the kind a lecturer sets for a written paper ("Explain...", "Discuss...", "Compare...", "List and describe...").`,
          `For each, give key_points: the ${Math.max(2, Math.min(a.marks + 1, 8))} or so separate points a full-mark answer should cover, in the wording of the notes, each with the page it comes from.`,
          "Leave options out.",
        ];

  const system = [
    `You write practice exam questions for the university course "${a.courseName}", Chapter ${a.chapterNumber}: ${a.chapterTitle}.`,
    "Use ONLY the chapter text the user provides. Every question must be answerable from that text. Do not use outside knowledge and do not invent facts.",
    "Use the terms and phrasing of the notes, because students are marked on that wording.",
    'The text is split into pages with markers like "[Page 12]". source_page must be the page number where the answer is found. If you are not sure, use null. Never guess a page number.',
    "Figures: if a question depends on one of the listed figures, put its exact label in figure_label. Otherwise use null. Never invent a label.",
    "Cover different parts of the chapter. Do not repeat or rephrase the questions listed as already existing.",
    "Write clear English with correct grammar. Do not mention that you are an AI or that the text was provided to you.",
    ...kindRules,
  ].join("\n");

  const figureLines = a.figures.length
    ? a.figures.map((f) => `- ${f.label ?? "Unlabelled figure"} (page ${f.page})`).join("\n")
    : "(none)";
  const existing = a.existing.length ? a.existing.map((t) => `- ${t.replace(/\s+/g, " ").slice(0, 160)}`).join("\n") : "(none)";

  const user = [
    "Figures in this chapter:",
    figureLines,
    "",
    "Questions that already exist (do not repeat them):",
    existing,
    "",
    "Chapter text:",
    chapterText(a.pages),
  ].join("\n");

  return { system, user };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clip = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\u0000/g, "").trim().slice(0, max) : "");

function fisherYates<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Raw = { text?: unknown; source_page?: unknown; figure_label?: unknown; options?: unknown; key_points?: unknown };

export type ValidateContext = {
  kind: GenKind;
  marks: number;
  count: number;
  pageCount: number;
  figures: FigureRef[];
  existing: string[];
  shuffle?: <T>(items: T[]) => T[]; // injectable so tests are deterministic
};

export function validateGenerated(raw: unknown, ctx: ValidateContext): { questions: CleanQuestion[]; skipped: string[] } {
  const skipped: string[] = [];
  const questions: CleanQuestion[] = [];
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return { questions, skipped: ["The model did not return a questions list."] };

  const seen = new Set(ctx.existing.map(norm));
  const shuffle = ctx.shuffle ?? fisherYates;
  const page = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= ctx.pageCount ? (v as number) : null);

  list.forEach((item: Raw, i: number) => {
    const where = `Question ${i + 1}`;
    if (questions.length >= ctx.count) return;
    const text = clip(item?.text, 1500);
    if (text.length < 15) return void skipped.push(`${where}: text missing or too short.`);
    if (seen.has(norm(text))) return void skipped.push(`${where}: duplicate of an existing question.`);

    let figureId: string | null = null;
    const label = clip(item.figure_label, 80);
    if (label) figureId = ctx.figures.find((f) => f.label && norm(f.label) === norm(label))?.id ?? null;

    const base = { kind: ctx.kind, text, marks: ctx.marks, source_page: page(item.source_page), figure_id: figureId };

    if (ctx.kind === "mcq") {
      const opts = Array.isArray(item.options) ? (item.options as { text?: unknown; is_correct?: unknown; explanation?: unknown }[]) : [];
      if (opts.length !== 4) return void skipped.push(`${where}: needs exactly four options.`);
      const cleaned = opts.map((o) => ({
        text: clip(o?.text, 1000).replace(/^\(?[A-Da-d][).:]\s+/, ""),
        is_correct: o?.is_correct === true,
        explanation: clip(o?.explanation, 2000) || null,
      }));
      if (cleaned.some((o) => !o.text)) return void skipped.push(`${where}: an option is empty.`);
      if (cleaned.filter((o) => o.is_correct).length !== 1) return void skipped.push(`${where}: needs exactly one correct option.`);
      if (new Set(cleaned.map((o) => norm(o.text))).size !== 4) return void skipped.push(`${where}: two options are the same.`);
      if (/\b(all|none) of the above\b/i.test(cleaned.map((o) => o.text).join(" "))) return void skipped.push(`${where}: uses "of the above" options.`);

      // Spread the correct answer over A to D, unless an explanation points at a letter.
      const mentionsLetter = cleaned.some((o) => o.explanation && /\b(option|choice)\s+[A-D]\b/i.test(o.explanation));
      const ordered = mentionsLetter ? cleaned : shuffle(cleaned);
      const labels = ["A", "B", "C", "D"] as const;
      seen.add(norm(text));
      questions.push({ ...base, answer_notes: null, options: ordered.map((o, k) => ({ label: labels[k], ...o })) });
      return;
    }

    const points = Array.isArray(item.key_points) ? (item.key_points as { point?: unknown; source_page?: unknown }[]) : [];
    const lines = points
      .map((p) => ({ point: clip(p?.point, 400), page: page(p?.source_page) }))
      .filter((p) => p.point)
      .slice(0, 10)
      .map((p) => `- ${p.point}${p.page ? ` (p. ${p.page})` : ""}`);
    if (lines.length === 0) return void skipped.push(`${where}: no key points.`);
    seen.add(norm(text));
    questions.push({ ...base, answer_notes: lines.join("\n"), options: [] });
  });

  return { questions, skipped };
}
