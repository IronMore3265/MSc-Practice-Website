// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { UUID_RE, formatClock, formatDuration, percent, setLabel, setsForPick } from "./practice.ts";

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

const sets = [
  { name: "Set 1", chapterId: null },
  { name: "Set 2", chapterId: null },
  { name: "Ch 1 Set 1", chapterId: "c1" },
  { name: "Ch 1 Set 2", chapterId: "c1" },
  { name: "Ch 2 Set 1", chapterId: "c2" },
];
const names = (list: { name: string }[]) => list.map((s) => s.name);

test("setsForPick shows only whole-exam sets for All", () => {
  assert.deepEqual(names(setsForPick(sets, ["c1", "c2", "c3"], true)), ["Set 1", "Set 2"]);
});

test("setsForPick shows only that chapter's sets for one chapter", () => {
  assert.deepEqual(names(setsForPick(sets, ["c1"], false)), ["Ch 1 Set 1", "Ch 1 Set 2"]);
  assert.deepEqual(names(setsForPick(sets, ["c2"], false)), ["Ch 2 Set 1"]);
});

test("setsForPick falls back to whole-exam sets when the picked chapters have none", () => {
  assert.deepEqual(names(setsForPick(sets, ["c3"], false)), ["Set 1", "Set 2"]);
  assert.deepEqual(names(setsForPick([{ name: "Set 1", chapterId: null }], ["c1"], false)), ["Set 1"]);
});

test("setsForPick with several chapters shows their chapter sets", () => {
  assert.deepEqual(names(setsForPick(sets, ["c1", "c2"], false)), ["Ch 1 Set 1", "Ch 1 Set 2", "Ch 2 Set 1"]);
});

test("setLabel drops the chapter prefix only when one chapter is picked", () => {
  assert.equal(setLabel(sets[2], ["c1"]), "Set 1");
  assert.equal(setLabel(sets[2], ["c1", "c2"]), "Ch 1 Set 1");
  assert.equal(setLabel(sets[0], ["c1", "c2"]), "Set 1");
});
