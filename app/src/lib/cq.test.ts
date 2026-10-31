// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE_STEPS, gradingProgress, markFraction } from "./cq.ts";
import { newGame, step, tickMs, turn } from "./snake.ts";

test("queued: step one stays active with the queue position, the bar barely moves", () => {
  const p = gradingProgress({ status: "queued", position: 3, runningMs: 0 });
  assert.equal(p.doneSteps, 0);
  assert.equal(p.activeStep, 0);
  assert.equal(p.note, "Position in queue #3");
  assert.equal(p.percent, 3);
  const later = gradingProgress({ status: "queued", position: 3, runningMs: 0, queuedMs: 60_000 });
  assert.ok(later.percent > 3 && later.percent <= 15);
  const ages = gradingProgress({ status: "queued", position: 1, runningMs: 0, queuedMs: 60 * 60_000 });
  assert.ok(ages.percent <= 15);
});

test("queued with no AI slot on says the marker is offline", () => {
  const p = gradingProgress({ status: "queued", position: 1, runningMs: 0, paused: true });
  assert.match(p.note ?? "", /offline/);
});

test("running: the bar eases toward 88 and never reaches it, steps finish in order", () => {
  const early = gradingProgress({ status: "running", position: null, runningMs: 0 });
  assert.equal(early.doneSteps, 1);
  assert.equal(early.activeStep, 1);
  const mid = gradingProgress({ status: "running", position: null, runningMs: 12_000 });
  assert.equal(mid.doneSteps, 2);
  const late = gradingProgress({ status: "running", position: null, runningMs: 25_000 });
  assert.equal(late.doneSteps, 3);
  assert.equal(late.activeStep, GRADE_STEPS.length - 1);
  const forever = gradingProgress({ status: "running", position: null, runningMs: 10 * 60_000 });
  assert.ok(forever.percent <= 88 && forever.percent >= late.percent);
  assert.ok(mid.percent > early.percent && late.percent > mid.percent);
});

test("done fills the bar and checks every step", () => {
  const p = gradingProgress({ status: "done", position: null, runningMs: 0 });
  assert.equal(p.percent, 100);
  assert.equal(p.doneSteps, GRADE_STEPS.length);
});

test("mark fraction handles ungraded and zero marks", () => {
  assert.equal(markFraction(null, 5), 0);
  assert.equal(markFraction(3, 5), 0.6);
  assert.equal(markFraction(3, 0), 0);
});

test("snake: moves one cell, grows and scores on food, cannot reverse", () => {
  const s = newGame(10, () => 0);
  assert.equal(s.snake.length, 3);
  const head = s.snake[0];
  const moved = step({ ...s, food: { x: 0, y: 0 } }, "right");
  assert.deepEqual(moved.snake[0], { x: head.x + 1, y: head.y });
  assert.equal(moved.snake.length, 3);
  assert.equal(turn("right", "left"), "right");
  assert.equal(turn("right", "up"), "up");

  const eat = step({ ...s, food: { x: head.x + 1, y: head.y } }, "right", () => 0);
  assert.equal(eat.snake.length, 4);
  assert.equal(eat.score, 1);
  assert.equal(eat.over, false);
  assert.ok(!eat.snake.some((p) => p.x === eat.food.x && p.y === eat.food.y), "new food is not on the snake");
});

test("snake: walls wrap to the other side, only your own body ends the game, and a finished game stays finished", () => {
  let s = newGame(6, () => 0);
  s = { ...s, food: { x: 0, y: 0 } };
  for (let i = 0; i < 3; i++) s = step(s, "right");
  assert.equal(s.over, false);
  assert.deepEqual(s.snake[0], { x: 0, y: 3 }, "leaving on the right comes back on the left");
  const top = step({ ...s, dir: "up", snake: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }, "up");
  assert.deepEqual(top.snake[0], { x: 2, y: 5 }, "leaving at the top comes back at the bottom");
  const bitten = step({ ...s, dir: "up", snake: [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }] }, "left");
  assert.equal(bitten.over, true);
  assert.equal(step(bitten, "up"), bitten);

  const curl = { size: 8, dir: "right" as const, food: { x: 7, y: 7 }, score: 0, over: false, snake: [
    { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }, { x: 3, y: 2 },
  ] };
  assert.equal(step(curl, "up").over, false, "moving into the free cell above is fine");
  const trapped = { ...curl, snake: [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 2 }], dir: "up" as const };
  assert.equal(step(trapped, "right").over, true, "running into its own body ends the game");
});

test("snake speeds up with the score but never below 70 ms", () => {
  assert.ok(tickMs(0) > tickMs(10));
  assert.equal(tickMs(1000), 70);
});
