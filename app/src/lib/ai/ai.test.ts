// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { JobFatalError, ModelOutputError, classifyError, parseRetryDelay } from "./errors.ts";
import { buildPrompt, validateGenerated } from "./generation.ts";
import { apiKeyFor, slotSpecs } from "./slots.ts";

const noShuffle = <T>(items: T[]) => items;
const figures = [{ id: "fig-1", label: "Figure 2.1", page: 4 }];
const ctx = { kind: "mcq" as const, marks: 1, count: 5, pageCount: 20, figures, existing: ["What is procurement in a supply chain?"], shuffle: noShuffle };

const goodMcq = (over: Record<string, unknown> = {}) => ({
  text: "Which step comes first in the sourcing process?",
  source_page: 7,
  figure_label: null,
  options: [
    { text: "Define the need", is_correct: true, explanation: "The need is defined before anything else." },
    { text: "Sign the contract", is_correct: false, explanation: "That is the last step." },
    { text: "Rate suppliers", is_correct: false, explanation: "Needs the criteria first." },
    { text: "Place the order", is_correct: false, explanation: "Comes after selection." },
  ],
  ...over,
});

test("classifyError sorts failures", () => {
  assert.deepEqual(classifyError(Object.assign(new Error('{"error":{"code":429,"details":[{"retryDelay":"34s"}]}}'), { status: 429 })), { kind: "rate_limit", retryAfterSec: 34 });
  assert.deepEqual(classifyError({ status: 429, message: "quota" }), { kind: "rate_limit", retryAfterSec: 60 });
  assert.equal(classifyError({ status: 429, message: "Please retry in 0.4s" }).kind, "rate_limit");
  assert.equal((classifyError({ status: 429, message: "retry in 0.4s" }) as { retryAfterSec: number }).retryAfterSec, 5); // floor
  assert.equal(classifyError({ status: 403, message: "denied" }).kind, "slot_problem");
  assert.equal(classifyError({ status: 400, message: "API key not valid" }).kind, "slot_problem");
  assert.equal(classifyError({ status: 404, message: "model not found" }).kind, "slot_problem");
  assert.equal(classifyError({ status: 400, message: "bad schema" }).kind, "job_error");
  assert.equal(classifyError(new ModelOutputError("empty")).kind, "job_error");
  assert.deepEqual(classifyError(new JobFatalError("no pdf")), { kind: "fatal", message: "no pdf" });
  assert.deepEqual(classifyError({ status: 503, message: "high demand" }), { kind: "rate_limit", retryAfterSec: 30 });
  assert.equal(classifyError({ status: 500, message: "internal" }).kind, "transient");
  assert.equal(classifyError(new Error("fetch failed")).kind, "transient");
  assert.equal(classifyError({ message: '{"error":{"code":429}}' }).kind, "rate_limit"); // status only inside the text
});

test("parseRetryDelay", () => {
  assert.equal(parseRetryDelay('"retryDelay": "12s"'), 12);
  assert.equal(parseRetryDelay("Please retry in 7.2s."), 8);
  assert.equal(parseRetryDelay("nothing"), null);
});

test("slotSpecs follows the environment", () => {
  const env = { GEMINI_KEY_A: "a", GEMINI_KEY_B: "b", GEMINI_MODEL_PRIMARY: "m1", GEMINI_MODEL_BACKUP: "m2" };
  assert.deepEqual(
    slotSpecs(env).map((s) => `${s.priority}:${s.key_name}:${s.tier}:${s.model}`),
    ["1:A:primary:m1", "2:A:backup:m2", "3:B:primary:m1", "4:B:backup:m2"],
  );
  assert.equal(slotSpecs({ ...env, GEMINI_KEY_B: " " }).length, 2);
  assert.equal(slotSpecs({ GEMINI_KEY_A: "a" }).length, 0);
  assert.equal(apiKeyFor("B", env), "b");
  assert.equal(apiKeyFor("B", {}), null);
});

test("a good MCQ passes and keeps one correct option", () => {
  const { questions, skipped } = validateGenerated({ questions: [goodMcq()] }, ctx);
  assert.deepEqual(skipped, []);
  assert.equal(questions.length, 1);
  assert.deepEqual(questions[0].options.map((o) => o.label), ["A", "B", "C", "D"]);
  assert.equal(questions[0].options.filter((o) => o.is_correct).length, 1);
  assert.equal(questions[0].source_page, 7);
});

test("invented page numbers and unknown figures are dropped, not trusted", () => {
  const { questions } = validateGenerated({ questions: [goodMcq({ source_page: 99, figure_label: "Figure 9.9" })] }, ctx);
  assert.equal(questions[0].source_page, null);
  assert.equal(questions[0].figure_id, null);
  const known = validateGenerated({ questions: [goodMcq({ figure_label: " figure 2.1 " })] }, ctx);
  assert.equal(known.questions[0].figure_id, "fig-1");
});

test("bad MCQs are skipped with a reason", () => {
  const three = goodMcq();
  (three.options as unknown[]).pop();
  const noCorrect = goodMcq();
  noCorrect.options[0].is_correct = false;
  const twoCorrect = goodMcq();
  twoCorrect.options[1].is_correct = true;
  const sameOptions = goodMcq();
  sameOptions.options[1].text = "define the NEED";
  const ofTheAbove = goodMcq();
  ofTheAbove.options[3].text = "All of the above";
  const dup = goodMcq({ text: "what is procurement in a supply chain?" });
  const short = goodMcq({ text: "Why?" });
  const { questions, skipped } = validateGenerated({ questions: [three, noCorrect, twoCorrect, sameOptions, ofTheAbove, dup, short] }, ctx);
  assert.equal(questions.length, 0);
  assert.equal(skipped.length, 7);
  assert.match(skipped[5], /duplicate/);
});

test("duplicates inside one batch are caught, and the count is respected", () => {
  const same = [goodMcq(), goodMcq(), goodMcq({ text: "A second, different question about suppliers?" })];
  const { questions } = validateGenerated({ questions: same }, { ...ctx, count: 5 });
  assert.equal(questions.length, 2);
  const limited = validateGenerated({ questions: same }, { ...ctx, count: 1 });
  assert.equal(limited.questions.length, 1);
});

test("option letters typed by the model are stripped, shuffle keeps exactly one correct", () => {
  const q = goodMcq();
  q.options[0].text = "A) Define the need";
  const { questions } = validateGenerated({ questions: [q] }, { ...ctx, shuffle: (items) => [...items].reverse() });
  assert.equal(questions[0].options[3].text, "Define the need");
  assert.equal(questions[0].options[3].is_correct, true);
  assert.equal(questions[0].options[0].label, "A");
});

test("explanations that point at a letter are not shuffled", () => {
  const q = goodMcq();
  q.options[1].explanation = "Option A is better because it comes first.";
  const { questions } = validateGenerated({ questions: [q] }, { ...ctx, shuffle: (items) => [...items].reverse() });
  assert.equal(questions[0].options[0].text, "Define the need");
});

test("CQ needs key points and turns them into notes", () => {
  const cq = { text: "Explain the difference between sourcing and procurement.", source_page: 3, key_points: [{ point: "Sourcing finds suppliers", source_page: 3 }, { point: "Procurement buys", source_page: 500 }] };
  const bad = { text: "Discuss supplier selection in detail.", key_points: [] };
  const { questions, skipped } = validateGenerated({ questions: [cq, bad] }, { ...ctx, kind: "cq", marks: 5 });
  assert.equal(questions.length, 1);
  assert.equal(questions[0].marks, 5);
  assert.equal(questions[0].answer_notes, "- Sourcing finds suppliers (p. 3)\n- Procurement buys");
  assert.match(skipped[0], /key points/);
});

test("garbage from the model is reported, not thrown", () => {
  assert.equal(validateGenerated(null, ctx).questions.length, 0);
  assert.equal(validateGenerated({ questions: "x" }, ctx).skipped.length, 1);
  assert.equal(validateGenerated({ questions: [null, 5, {}] }, ctx).skipped.length, 3);
});

test("prompt carries the chapter text with page markers, figures and existing questions", () => {
  const { system, user } = buildPrompt({
    courseName: "Sourcing",
    chapterNumber: 3,
    chapterTitle: "Supplier Evaluation",
    kind: "mcq",
    count: 4,
    marks: 1,
    pages: [{ page: 1, text: "Alpha" }, { page: 2, text: "Beta" }],
    figures,
    existing: ["Old question?"],
  });
  assert.match(system, /exactly four options/);
  assert.match(system, /Never guess a page number/);
  assert.match(user, /\[Page 1\]\nAlpha/);
  assert.match(user, /- Figure 2.1 \(page 4\)/);
  assert.match(user, /- Old question\?/);
});

test("a hung call that our timeout aborted rests the slot and counts as an attempt", () => {
  const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
  assert.deepEqual(classifyError(abort), { kind: "timeout", cooldownSec: 60 });
  assert.equal(classifyError(new Error("request timed out")).kind, "timeout");
  assert.equal(classifyError(Object.assign(new Error("boom"), { status: 500 })).kind, "transient");
  assert.equal(classifyError(Object.assign(new Error("slow"), { status: 429 })).kind, "rate_limit");
});
