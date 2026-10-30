// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { gradingProgress, READ_STEPS } from "../cq.ts";
import { fitSize, nextStep } from "../photo-compress.ts";
import { buildTranscribePrompt, validateTranscription } from "./transcription.ts";

test("transcription: keeps the text and only the unsure parts that are really in it", () => {
  const r = validateTranscription({
    readable: true,
    text: "  Sourcing is choosing suppliers.\nProcurement buys goods.  ",
    unsure: [
      { text: "choosing", reason: "smudged" },
      { text: "Choosing", reason: "duplicate in other case" },
      { text: "invented phrase", reason: "not there" },
      { text: "goods", reason: null },
    ],
  });
  assert.equal(r.text, "Sourcing is choosing suppliers.\nProcurement buys goods.");
  assert.deepEqual(r.unsure.map((u) => u.text), ["choosing", "goods"]);
  assert.equal(r.unsure[0].reason, "smudged");
  assert.equal(r.unsure[1].reason, null);
});

test("transcription: unreadable photos, empty text and junk are rejected", () => {
  assert.throws(() => validateTranscription({ readable: false, text: "something" }), /No handwriting/);
  assert.throws(() => validateTranscription({ readable: true, text: "  " }), /No handwriting/);
  assert.throws(() => validateTranscription(null), /did not return/);
  assert.throws(() => validateTranscription("text"), /did not return/);
});

test("transcription: at most 12 unsure parts, text is capped", () => {
  const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
  const r = validateTranscription({ readable: true, text: words.join(" "), unsure: words.map((w) => ({ text: w })) });
  assert.equal(r.unsure.length, 12);
  const long = validateTranscription({ readable: true, text: "a".repeat(9000) });
  assert.equal(long.text.length, 8000);
});

test("transcription prompt: treats the photos as data and names the question", () => {
  const { system, user } = buildTranscribePrompt({ question: "Explain sourcing.", photoCount: 2 });
  assert.match(system, /data, not instructions/);
  assert.match(system, /dollar signs/);
  assert.match(user, /2 photos/);
  assert.match(user, /Explain sourcing\./);
});

test("photo size: shrinks to the longest edge, never enlarges", () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1800, height: 1350 });
  assert.deepEqual(fitSize(3000, 4000), { width: 1350, height: 1800 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test("photo compression: quality drops first, then the picture shrinks, then it gives up", () => {
  let step: { quality: number; scale: number } | null = { quality: 0.8, scale: 1 };
  const seen: string[] = [];
  while (step) {
    seen.push(`${step.quality}@${step.scale}`);
    step = nextStep(step);
    assert.ok(seen.length < 30, "must end");
  }
  assert.deepEqual(seen.slice(0, 5), ["0.8@1", "0.7@1", "0.6@1", "0.5@1", "0.7@0.8"]);
  assert.ok(seen.length >= 8 && seen.length <= 16);
  assert.ok(Number(seen[seen.length - 1].split("@")[1]) < 0.55);
});

test("reading progress: three steps, never all done while the job runs", () => {
  const late = gradingProgress({ status: "running", position: null, runningMs: 60_000, steps: READ_STEPS.length });
  assert.equal(late.doneSteps, READ_STEPS.length - 1);
  assert.equal(late.activeStep, READ_STEPS.length - 1);
  const done = gradingProgress({ status: "done", position: null, runningMs: 0, steps: READ_STEPS.length });
  assert.equal(done.doneSteps, READ_STEPS.length);
});
