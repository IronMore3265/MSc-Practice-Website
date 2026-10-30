// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasMath, joinInline, parseRows, rowCount, serializeRows, splitInline } from "./math-text.ts";

test("splitInline: sentences with inline math", () => {
  assert.deepEqual(splitInline("Since $z=\\frac{14-10}{2}=2$ we use the table."), [
    { type: "text", text: "Since " },
    { type: "math", latex: "z=\\frac{14-10}{2}=2" },
    { type: "text", text: " we use the table." },
  ]);
});

test("splitInline: an unmatched dollar stays text, an escaped dollar is a dollar", () => {
  assert.deepEqual(splitInline("It costs $5 only"), [{ type: "text", text: "It costs $5 only" }]);
  assert.deepEqual(splitInline("Pay \\$5 and \\$6"), [{ type: "text", text: "Pay $5 and $6" }]);
});

test("splitInline: double dollars inside a sentence are inline math, empty math is dropped", () => {
  assert.deepEqual(splitInline("so $$x^2$$ here"), [
    { type: "text", text: "so " },
    { type: "math", latex: "x^2" },
    { type: "text", text: " here" },
  ]);
  assert.deepEqual(splitInline("a $ $ b"), [{ type: "text", text: "a  b" }]);
});

test("joinInline escapes plain dollars and round trips", () => {
  const line = "Cost \\$5 then $x_1+x_2$ done";
  assert.equal(joinInline(splitInline(line)), line);
});

test("parseRows: equation rows, text rows, blank lines skipped, CRLF", () => {
  const rows = parseRows("Let X be normal.\r\n\r\n$$P(X>14)=1-\\Phi(2)$$\nSo $p=0.0228$.\n");
  assert.deepEqual(rows, [
    { kind: "text", value: "Let X be normal." },
    { kind: "equation", value: "P(X>14)=1-\\Phi(2)" },
    { kind: "text", value: "So $p=0.0228$." },
  ]);
  assert.equal(rowCount("a\n\n$$b$$"), 2);
});

test("parseRows: two display equations on one line are a text row with inline math, not an equation row", () => {
  const rows = parseRows("$$a$$ and $$b$$");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "text");
});

test("serializeRows drops empty rows and keeps each row on one line", () => {
  const text = serializeRows([
    { kind: "text", value: "First" },
    { kind: "text", value: "   " },
    { kind: "equation", value: "a=b" },
    { kind: "equation", value: "" },
    { kind: "text", value: "two\nlines" },
  ]);
  assert.equal(text, "First\n$$a=b$$\ntwo lines");
});

test("parse then serialize is stable", () => {
  const text = "Given $\\mu=10$ and $\\sigma=2$.\n$$z=\\frac{14-10}{2}=2$$\nHence the answer.";
  assert.equal(serializeRows(parseRows(text)), text);
});

test("hasMath", () => {
  assert.equal(hasMath("plain words only"), false);
  assert.equal(hasMath("with $x$ inside"), true);
  assert.equal(hasMath("$$x$$"), true);
});
