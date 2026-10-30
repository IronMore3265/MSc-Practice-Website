// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { UUID_RE, formatClock, formatDuration, percent } from "./practice.ts";

test("formatClock shows minutes and seconds with leading zeros", () => {
  assert.equal(formatClock(600), "10:00");
  assert.equal(formatClock(462), "07:42");
  assert.equal(formatClock(9), "00:09");
  assert.equal(formatClock(0), "00:00");
});

test("formatClock never goes below zero and ignores fractions", () => {
  assert.equal(formatClock(-5), "00:00");
  assert.equal(formatClock(59.9), "00:59");
});

test("formatDuration reads as words", () => {
  assert.equal(formatDuration(372), "6 min 12 s");
  assert.equal(formatDuration(45), "45 s");
  assert.equal(formatDuration(60), "1 min 0 s");
  assert.equal(formatDuration(-3), "0 s");
});

test("percent rounds and handles an empty total", () => {
  assert.equal(percent(7, 10), 70);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(2, 3), 67);
  assert.equal(percent(0, 0), 0);
});

test("UUID_RE accepts ids and rejects anything else", () => {
  assert.ok(UUID_RE.test("0f8fad5b-d9cb-469f-a165-70867728950e"));
  assert.ok(!UUID_RE.test("not-a-uuid"));
  assert.ok(!UUID_RE.test("0f8fad5b-d9cb-469f-a165-70867728950e'; drop table question;--"));
});
