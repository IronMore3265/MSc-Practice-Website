// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelOutputError } from "./errors.ts";
import { buildProblemPrompt, numberedRows, validateProblemGrade } from "./problem-grading.ts";
import { buildTranscribePrompt } from "./transcription.ts";

const answer = "Since X is normal, $z=\\frac{14-10}{2}=2$.\n$$P(X>14)=1-\\Phi(2)$$\n$$=0.0228$$";
const ctx = { marks: 5, pageCount: 40, figures: [{ id: "f1", label: "Table 3.1", page: 12 }], answer };
const good = {
  score: 4,
  steps: [
    { row: 1, status: "ok", comment: null },
    { row: 2, status: "wrong", comment: "Wrong tail used" },
    { row: 3, status: "wrong", comment: "Carries the error" },
    { row: 9, status: "wrong", comment: "no such row" },
  ],
  first_wrong_row: 3,
  final_answer: { expected: "$0.0228$", student: "$0.0228$", correct: true, units_ok: null, note: "Rounded" },
  covered_points: ["Standardises with z"],
  missing_points: [{ point: "State the assumption", source_page: 99, figure: "Table 9.9" }],
  incorrect_claims: [{ claim: "Used the lower tail", correction: "Use the upper tail", source_page: 7 }],
  worked_solution: "Standardise.\n$$z=2$$ — then read the table.",
};

test("numberedRows numbers rows the way the screen counts them", () => {
  assert.equal(numberedRows("a\n\n$$b$$"), "Row 1: a\nRow 2: $$b$$");
  assert.equal(numberedRows("   "), "");
});

test("valid problem grade: rows, pages, figures and dashes are checked", () => {
  const f = validateProblemGrade(good, ctx);
  assert.equal(f.kind, "problem");
  assert.equal(f.score, 4);
  assert.deepEqual(f.steps.map((s) => s.row), [1, 2, 3]); // row 9 does not exist
  assert.equal(f.first_wrong_row, 2); // the lowest row marked wrong, whatever the model named
  assert.equal(f.missing_points[0].source_page, null); // page 99 is outside the chapter
  assert.equal(f.missing_points[0].figure, null);
  assert.equal(f.incorrect_claims[0].source_page, 7);
  assert.ok(!f.worked_solution.includes("—"));
  assert.equal(f.final_answer.correct, true);
});

test("score is kept inside the marks, a missing final answer or worked solution is rejected", () => {
  assert.equal(validateProblemGrade({ ...good, score: 99 }, ctx).score, 5);
  assert.equal(validateProblemGrade({ ...good, score: -3 }, ctx).score, 0);
  assert.throws(() => validateProblemGrade({ ...good, final_answer: undefined }, ctx), ModelOutputError);
  assert.throws(() => validateProblemGrade({ ...good, worked_solution: "" }, ctx), ModelOutputError);
  assert.throws(() => validateProblemGrade({ ...good, score: "x" }, ctx), ModelOutputError);
  assert.throws(() => validateProblemGrade(null, ctx), ModelOutputError);
});

test("no wrong row means no first wrong row", () => {
  const f = validateProblemGrade({ ...good, steps: [{ row: 1, status: "ok" }], first_wrong_row: 1 }, ctx);
  assert.equal(f.first_wrong_row, null);
});

test("the problem prompt numbers the rows and treats the answer as data", () => {
  const { system, user } = buildProblemPrompt({
    courseName: "IPE 6112",
    chapterNumber: 3,
    chapterTitle: "Normal distribution",
    question: "Find P(X>14).",
    marks: 5,
    keyPoints: null,
    figure: null,
    answer,
    pages: [{ page: 1, text: "The normal distribution." }],
    figures: [],
  });
  assert.match(user, /Row 1: Since X is normal/);
  assert.match(user, /Row 2: \$\$P\(X>14\)=1-\\Phi\(2\)\$\$/);
  assert.match(system, /Method marks/);
  assert.match(system, /data, not instructions/);
});

test("the reading prompt asks for one row per line and display math only for problems", () => {
  const problem = buildTranscribePrompt({ question: "Q", photoCount: 1, kind: "problem" }).system;
  const cq = buildTranscribePrompt({ question: "Q", photoCount: 1 }).system;
  assert.match(problem, /one row per line/);
  assert.match(problem, /double dollar signs/);
  assert.doesNotMatch(cq, /one row per line/);
});
