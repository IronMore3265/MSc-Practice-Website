"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UnsurePart } from "@/lib/cq";
import { loadMathLive, type MathLiveModule, type MathfieldElement } from "@/lib/mathlive";
import { joinInline, parseRows, serializeRows, splitInline, type Row, type Segment } from "@/lib/math-text";

// The mixed text and math answer editor (plan 7b, mockup screen 11). The answer is a list of numbered rows. A text
// row is a sentence with small math boxes inside it, an equation row is a centred equation. The saved result is
// always the dollar sign text from lib/math-text.ts, so this editor can be swapped later.
//
// Built the simple way: each text row is one contenteditable line holding text and MathLive boxes (<math-field>),
// each equation row is one MathLive box. React owns the list of rows, the DOM inside a row belongs to the row.

const MAX_CHARS = 8000;
const ZW = "​"; // zero width space: gives the caret somewhere to stand next to a math box

type RowState = Row & { id: number; rev: number };

type RowApi = {
  focus: (where?: "start" | "end") => void;
  insertMath: (latex?: string) => MathfieldElement | null;
  mathField: () => MathfieldElement | null;
  jump: (part: string) => void;
};

type Key = { label: string; title: string; latex?: string; cmd?: string };

// Math keys that work inside any math box. #? is a placeholder the student fills in next.
const KEYS: Key[] = [
  { label: "a/b", title: "Fraction", latex: "\\frac{#?}{#?}" },
  { label: "xⁿ", title: "Power", cmd: "moveToSuperscript" },
  { label: "xₙ", title: "Subscript", cmd: "moveToSubscript" },
  { label: "√", title: "Square root", latex: "\\sqrt{#?}" },
  { label: "ⁿ√", title: "Nth root", latex: "\\sqrt[#?]{#?}" },
  { label: "Σ", title: "Sum", latex: "\\sum_{#?}^{#?}" },
  { label: "∫", title: "Integral", latex: "\\int_{#?}^{#?}" },
  { label: "( )", title: "Brackets", latex: "\\left(#?\\right)" },
  { label: "x̄", title: "Overline", latex: "\\overline{#?}" },
  { label: "x̂", title: "Hat", latex: "\\hat{#?}" },
  { label: "μ", title: "mu", latex: "\\mu" },
  { label: "σ", title: "sigma", latex: "\\sigma" },
  { label: "ρ", title: "rho", latex: "\\rho" },
  { label: "β", title: "beta", latex: "\\beta" },
  { label: "λ", title: "lambda", latex: "\\lambda" },
  { label: "α", title: "alpha", latex: "\\alpha" },
  { label: "θ", title: "theta", latex: "\\theta" },
  { label: "Φ", title: "Capital phi", latex: "\\Phi" },
  { label: "π", title: "pi", latex: "\\pi" },
  { label: "∞", title: "Infinity", latex: "\\infty" },
  { label: "±", title: "Plus or minus", latex: "\\pm" },
  { label: "≤", title: "Less than or equal", latex: "\\le" },
  { label: "≥", title: "Greater than or equal", latex: "\\ge" },
  { label: "≠", title: "Not equal", latex: "\\ne" },
  { label: "≈", title: "Approximately", latex: "\\approx" },
];

// The "More" panel: probability and statistics, units, arrows.
const MORE: { group: string; keys: Key[] }[] = [
  {
    group: "Probability and statistics",
    keys: [
      { label: "P( )", title: "Probability", latex: "\\mathrm{P}\\left(#?\\right)" },
      { label: "E[ ]", title: "Expected value", latex: "\\mathrm{E}\\left[#?\\right]" },
      { label: "Var", title: "Variance", latex: "\\mathrm{Var}\\left(#?\\right)" },
      { label: "Cov", title: "Covariance", latex: "\\mathrm{Cov}\\left(#?, #?\\right)" },
      { label: "|", title: "Given that", latex: "\\mid" },
      { label: "∩", title: "Intersection", latex: "\\cap" },
      { label: "∪", title: "Union", latex: "\\cup" },
      { label: "∈", title: "Element of", latex: "\\in" },
      { label: "~", title: "Distributed as", latex: "\\sim" },
      { label: "(n k)", title: "Combinations", latex: "\\binom{#?}{#?}" },
      { label: "χ²", title: "Chi squared", latex: "\\chi^2" },
      { label: "p̂", title: "p hat", latex: "\\hat{p}" },
      { label: "Δ", title: "Delta", latex: "\\Delta" },
      { label: "γ", title: "gamma", latex: "\\gamma" },
      { label: "τ", title: "tau", latex: "\\tau" },
      { label: "ε", title: "epsilon", latex: "\\varepsilon" },
    ],
  },
  {
    group: "Units and percent",
    keys: [
      { label: "%", title: "Percent", latex: "\\%" },
      { label: "°", title: "Degree", latex: "^\\circ" },
      { label: "kg", title: "Kilogram", latex: "\\,\\mathrm{kg}" },
      { label: "m", title: "Metre", latex: "\\,\\mathrm{m}" },
      { label: "mm", title: "Millimetre", latex: "\\,\\mathrm{mm}" },
      { label: "s", title: "Second", latex: "\\,\\mathrm{s}" },
      { label: "h", title: "Hour", latex: "\\,\\mathrm{h}" },
      { label: "N", title: "Newton", latex: "\\,\\mathrm{N}" },
      { label: "Tk", title: "Taka", latex: "\\,\\mathrm{Tk}" },
    ],
  },
  {
    group: "Arrows and signs",
    keys: [
      { label: "→", title: "Arrow", latex: "\\to" },
      { label: "⇒", title: "Implies", latex: "\\Rightarrow" },
      { label: "⇔", title: "If and only if", latex: "\\Leftrightarrow" },
      { label: "×", title: "Times", latex: "\\times" },
      { label: "·", title: "Dot", latex: "\\cdot" },
      { label: "÷", title: "Divide", latex: "\\div" },
      { label: "∴", title: "Therefore", latex: "\\therefore" },
    ],
  },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const lineOf = (r: Row) => (r.kind === "equation" ? `$$${r.value}$$` : r.value);

// What a text row holds, as dollar sign text.
function readText(div: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) {
        out += (c.nodeValue ?? "").replace(/​/g, "").replace(/ /g, " ").replace(/\$/g, "\\$");
      } else if (c instanceof HTMLElement && c.tagName === "MATH-FIELD") {
        const latex = (c as MathfieldElement).value.trim();
        if (latex) out += `${out.endsWith("\\") ? " " : ""}$${latex}$`;
      } else if (c instanceof HTMLElement && c.tagName !== "BR") {
        walk(c);
      }
    });
  };
  walk(div);
  return out.replace(/\s+/g, " ").trim();
}

// The row as the student typed it: plain text as it is (a dollar sign here is a typed one), math boxes as $latex$.
function rawText(div: HTMLElement): string {
  let out = "";
  div.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) out += (c.nodeValue ?? "").replace(/​/g, "").replace(/ /g, " ");
    else if (c instanceof HTMLElement && c.tagName === "MATH-FIELD") out += `$${(c as MathfieldElement).value.trim()}$`;
  });
  return out;
}

// Every math box needs a text node on both sides so the caret can stand next to it.
function padMath(div: HTMLElement) {
  for (const mf of Array.from(div.querySelectorAll("math-field"))) {
    const before = mf.previousSibling;
    const after = mf.nextSibling;
    if (!before || before.nodeType !== Node.TEXT_NODE) mf.before(document.createTextNode(ZW));
    if (!after || after.nodeType !== Node.TEXT_NODE) mf.after(document.createTextNode(ZW));
  }
}

function placeCaret(node: Node, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function exitMath(mf: MathfieldElement, dir: 1 | -1) {
  const div = mf.parentElement;
  if (!div) return;
  padMath(div);
  div.focus();
  if (dir > 0) {
    const next = mf.nextSibling as Text;
    placeCaret(next, (next.nodeValue ?? "").startsWith(ZW) ? 1 : 0);
  } else {
    const prev = mf.previousSibling as Text;
    placeCaret(prev, (prev.nodeValue ?? "").length);
  }
}

// A math box next to the caret, when the arrow key is about to move onto it.
function mathBeside(div: HTMLElement, dir: 1 | -1): MathfieldElement | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || !div.contains(sel.anchorNode)) return null;
  let sibling: Node | null = null;
  if (sel.anchorNode === div) {
    sibling = div.childNodes[dir > 0 ? sel.anchorOffset : sel.anchorOffset - 1] ?? null;
  } else if (sel.anchorNode.nodeType === Node.TEXT_NODE) {
    const text = sel.anchorNode.nodeValue ?? "";
    const at = sel.anchorOffset;
    if (dir > 0 && text.slice(at).replace(/​/g, "") === "") sibling = sel.anchorNode.nextSibling;
    if (dir < 0 && text.slice(0, at).replace(/​/g, "") === "") sibling = sel.anchorNode.previousSibling;
  }
  return sibling instanceof HTMLElement && sibling.tagName === "MATH-FIELD" ? (sibling as MathfieldElement) : null;
}

type RowProps = {
  row: RowState;
  ml: MathLiveModule;
  disabled: boolean;
  onValue: (id: number, value: string) => void;
  onEnter: (id: number) => void;
  onEmptyBackspace: (id: number) => void;
  register: (id: number, api: RowApi | null) => void;
};

function TextRow({ row, ml, disabled, onValue, onEnter, onEmptyBackspace, register }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);

  const report = useCallback(() => {
    if (ref.current) onValue(row.id, readText(ref.current));
  }, [onValue, row.id]);

  const wire = useCallback(
    (mf: MathfieldElement) => {
      mf.mathVirtualKeyboardPolicy = "auto";
      mf.addEventListener("input", report);
      // Capture phase, so this runs before MathLive handles the key itself. A second dollar sign leaves the box.
      mf.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "$") {
            e.preventDefault();
            e.stopPropagation();
            exitMath(mf, 1);
          }
        },
        true,
      );
      mf.addEventListener("move-out", (e) => {
        e.preventDefault();
        exitMath(mf, e.detail.direction === "backward" ? -1 : 1);
      });
      // An empty box that is left again is removed, so a stray dollar sign leaves nothing behind.
      mf.addEventListener("focusout", () => {
        setTimeout(() => {
          if (mf.isConnected && !mf.value.trim() && document.activeElement !== mf) {
            const div = mf.parentElement;
            mf.remove();
            div?.normalize();
            report();
          }
        }, 200);
      });
    },
    [report],
  );

  const insertMath = useCallback(
    (latex = "") => {
      const div = ref.current;
      if (!div) return null;
      div.focus();
      const sel = window.getSelection();
      let range: Range;
      if (sel && sel.rangeCount && div.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(div);
        range.collapse(false);
      }
      range.deleteContents();
      const mf = new ml.MathfieldElement();
      mf.value = latex;
      wire(mf);
      range.insertNode(mf);
      padMath(div);
      setTimeout(() => mf.focus(), 0);
      report();
      return mf;
    },
    [ml, wire, report],
  );

  const fill = useCallback(
    (segments: Segment[]) => {
      const div = ref.current;
      if (!div) return null;
      let last: MathfieldElement | null = null;
      div.replaceChildren();
      for (const seg of segments) {
        if (seg.type === "text") {
          div.append(document.createTextNode(seg.text));
        } else {
          const mf = new ml.MathfieldElement();
          mf.value = seg.latex;
          wire(mf);
          div.append(mf);
          last = mf;
        }
      }
      padMath(div);
      return last;
    },
    [ml, wire],
  );

  // Build the row once. The row is remounted (new rev) when undo or a kind switch replaces its content.
  useEffect(() => {
    fill(splitInline(row.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once from the first value
  }, []);

  // Phone keyboards do not always send a key name, so a typed dollar sign is also caught as text about to be inserted.
  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    const onBefore = (e: InputEvent) => {
      if (e.inputType === "insertText" && e.data === "$") {
        e.preventDefault();
        insertMath("");
      }
    };
    div.addEventListener("beforeinput", onBefore);
    return () => div.removeEventListener("beforeinput", onBefore);
  }, [insertMath]);

  useEffect(() => {
    register(row.id, {
      focus: (where = "end") => {
        const div = ref.current;
        if (!div) return;
        div.focus();
        const last = div.lastChild;
        if (where === "start") placeCaret(div, 0);
        else if (last && last.nodeType === Node.TEXT_NODE) placeCaret(last, (last.nodeValue ?? "").length);
        else placeCaret(div, div.childNodes.length);
      },
      insertMath,
      mathField: () => null,
      jump: (part) => {
        const div = ref.current;
        if (!div) return;
        const wanted = part.replace(/\$/g, "").replace(/\s+/g, "");
        if (part.includes("$")) {
          const hit = Array.from(div.querySelectorAll("math-field")).find((m) => (m as MathfieldElement).value.replace(/\s+/g, "").includes(wanted));
          if (hit) return void (hit as MathfieldElement).focus();
        } else {
          const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const at = (n.nodeValue ?? "").indexOf(part);
            if (at === -1) continue;
            div.focus();
            const range = document.createRange();
            range.setStart(n, at);
            range.setEnd(n, at + part.length);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
        }
        div.focus();
      },
    });
    return () => register(row.id, null);
  }, [register, row.id, insertMath]);

  async function paste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
    for (const seg of splitInline(text)) {
      if (seg.type === "text") document.execCommand("insertText", false, seg.text);
      else {
        const mf = insertMath(seg.latex);
        if (mf) exitMath(mf, 1);
      }
    }
    report();
  }

  return (
    <div
      ref={ref}
      className="mrow-text"
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Row text`}
      data-placeholder="Write a sentence. Type $ for math."
      spellCheck
      onInput={(e) => {
        // Last resort for keyboards that send neither a key name nor a cancelable beforeinput (voice typing, some
        // input methods). A lone dollar sign is taken back out and a math box opens in its place. A longer chunk
        // with a dollar sign in it is read as dollar sign text, and a dollar sign left open starts a math box.
        const ev = e.nativeEvent as InputEvent;
        const sel = window.getSelection();
        const node = sel?.anchorNode;
        if (ev.inputType === "insertText" && ev.data === "$" && node?.nodeType === Node.TEXT_NODE && sel && (node.nodeValue ?? "")[sel.anchorOffset - 1] === "$") {
          (node as Text).deleteData(sel.anchorOffset - 1, 1);
          insertMath("");
          return;
        }
        if (ev.inputType === "insertText" && ev.data && ev.data.includes("$") && ref.current) {
          const segments = splitInline(rawText(ref.current));
          const tail = segments[segments.length - 1];
          const open = tail?.type === "text" ? tail.text.lastIndexOf("$") : -1;
          if (tail?.type === "text" && open !== -1) {
            segments.pop();
            if (open > 0) segments.push({ type: "text", text: tail.text.slice(0, open) });
            segments.push({ type: "math", latex: tail.text.slice(open + 1).trim() });
          }
          const box = fill(segments);
          report();
          if (box) {
            setTimeout(() => {
              box.focus();
              box.executeCommand("moveToMathfieldEnd");
            }, 0);
          }
          return;
        }
        report();
      }}
      onPaste={(e) => void paste(e)}
      onDrop={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) return e.preventDefault();
        if (e.key === "$") {
          e.preventDefault();
          insertMath("");
        } else if (e.key === "Enter") {
          e.preventDefault();
          onEnter(row.id);
        } else if (e.key === "Backspace" && ref.current && readText(ref.current) === "") {
          e.preventDefault();
          onEmptyBackspace(row.id);
        } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && ref.current && !e.shiftKey) {
          const dir = e.key === "ArrowRight" ? 1 : -1;
          const mf = mathBeside(ref.current, dir);
          if (mf) {
            e.preventDefault();
            mf.focus();
            mf.executeCommand(dir > 0 ? "moveToMathfieldStart" : "moveToMathfieldEnd");
          }
        }
      }}
    />
  );
}

function EquationRow({ row, ml, disabled, onValue, onEnter, onEmptyBackspace, register }: RowProps) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const mf = new ml.MathfieldElement();
    mf.value = row.value;
    mf.mathVirtualKeyboardPolicy = "auto";
    mf.readOnly = disabled;
    mf.addEventListener("input", () => onValue(row.id, mf.value));
    mf.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onEnter(row.id);
        } else if (e.key === "Backspace" && !mf.value.trim()) {
          e.preventDefault();
          e.stopPropagation();
          onEmptyBackspace(row.id);
        }
      },
      true,
    );
    el.replaceChildren(mf);
    field.current = mf;
    register(row.id, {
      focus: () => void setTimeout(() => mf.focus(), 0),
      insertMath: () => mf,
      mathField: () => mf,
      jump: () => void setTimeout(() => mf.focus(), 0),
    });
    return () => register(row.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once from the first value
  }, []);

  useEffect(() => {
    if (field.current) field.current.readOnly = disabled;
  }, [disabled]);

  return <div ref={host} className="mrow-eq" aria-label="Equation" />;
}

// Rows as they were before, for undo and redo.
type History = { past: RowState[][]; future: RowState[][] };

const toStates = (rows: Row[], start: number): RowState[] => rows.map((r, i) => ({ ...r, id: start + i, rev: 0 }));

// Sentence to equation and back, keeping what was typed.
function convert(row: RowState): Row {
  if (row.kind === "text") {
    const segs = splitInline(row.value);
    const latex = segs.map((s) => (s.type === "math" ? s.latex : `\\text{${s.text.replace(/[\\{}]/g, "")}}`)).join(" ");
    return { kind: "equation", value: latex };
  }
  return { kind: "text", value: joinInline([{ type: "math", latex: row.value }]) };
}

export function MathAnswerEditor({
  value,
  onChange,
  disabled = false,
  unsure = [],
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  unsure?: UnsurePart[];
}) {
  const [ml, setMl] = useState<MathLiveModule | null>(null);
  const nextId = useRef(0);
  const [rows, setRowsState] = useState<RowState[]>(() => {
    const parsed = parseRows(value);
    return toStates(parsed.length ? parsed : [{ kind: "text", value: "" }], 1);
  });
  const rowsRef = useRef(rows);
  const history = useRef<History>({ past: [], future: [] });
  const group = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apis = useRef(new Map<number, RowApi>());
  const [active, setActive] = useState<number | null>(null);
  const activeMath = useRef<MathfieldElement | null>(null);
  const pendingFocus = useRef<{ id: number; where: "start" | "end" } | null>(null);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let gone = false;
    void loadMathLive().then((m) => !gone && setMl(m));
    return () => {
      gone = true;
    };
  }, []);

  const setRows = useCallback((next: RowState[]) => {
    rowsRef.current = next;
    setRowsState(next);
  }, []);

  const text = useMemo(() => serializeRows(rows), [rows]);
  useEffect(() => {
    onChangeRef.current(text);
  }, [text]);

  const remember = useCallback(() => {
    history.current.past.push(rowsRef.current);
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    setDepth({ past: history.current.past.length, future: 0 });
  }, []);

  const register = useCallback((id: number, api: RowApi | null) => {
    if (api) apis.current.set(id, api);
    else apis.current.delete(id);
  }, []);

  // Typing: the first change of a burst is remembered for undo, the rest of the burst is part of it.
  const onValue = useCallback(
    (id: number, v: string) => {
      if (rowsRef.current.find((r) => r.id === id)?.value === v) return;
      if (!group.current) remember();
      else clearTimeout(group.current);
      group.current = setTimeout(() => (group.current = null), 800);
      setRows(rowsRef.current.map((r) => (r.id === id ? { ...r, value: v } : r)));
    },
    [remember, setRows],
  );

  // Structural change: remembered at once, and the caret goes to a row afterward.
  const change = useCallback(
    (next: RowState[], focus?: { id: number; where: "start" | "end" }) => {
      if (group.current) {
        clearTimeout(group.current);
        group.current = null;
      }
      remember();
      pendingFocus.current = focus ?? null;
      setRows(next);
    },
    [remember, setRows],
  );

  useEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    pendingFocus.current = null;
    apis.current.get(f.id)?.focus(f.where);
  });

  const addRow = useCallback(
    (kind: "text" | "equation", after?: number | null) => {
      const id = Math.max(nextId.current, ...rowsRef.current.map((x) => x.id)) + 1;
      nextId.current = id;
      const row: RowState = { id, rev: 0, kind, value: "" };
      const list = rowsRef.current;
      const at = after == null ? list.length : list.findIndex((r) => r.id === after) + 1;
      change([...list.slice(0, at), row, ...list.slice(at)], { id: row.id, where: "end" });
    },
    [change],
  );

  const removeRow = useCallback(
    (id: number) => {
      const list = rowsRef.current;
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return;
      if (list.length === 1) {
        change([{ ...list[0], kind: "text", value: "", rev: list[0].rev + 1 }], { id: list[0].id, where: "end" });
        return;
      }
      const next = list.filter((r) => r.id !== id);
      const near = next[Math.max(0, i - 1)];
      change(next, { id: near.id, where: "end" });
    },
    [change],
  );

  const move = (id: number, dir: -1 | 1) => {
    const list = [...rowsRef.current];
    const i = list.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change(list, { id, where: "end" });
  };

  const switchKind = (id: number) => {
    change(
      rowsRef.current.map((r) => (r.id === id ? { ...r, ...convert(r), rev: r.rev + 1 } : r)),
      { id, where: "end" },
    );
  };

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(rowsRef.current);
    if (group.current) clearTimeout(group.current);
    group.current = null;
    setRows(prev.map((r) => ({ ...r, rev: r.rev + 1 })));
    setDepth({ past: h.past.length, future: h.future.length });
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(rowsRef.current);
    setRows(next.map((r) => ({ ...r, rev: r.rev + 1 })));
    setDepth({ past: h.past.length, future: h.future.length });
  };

  // Toolbar. Keys keep the focus where it is (mouse down is cancelled), then act on the math box being edited.
  // With no math box in use, the key starts one: inline in a text row, or the box of an equation row.
  const targetMath = (): MathfieldElement | null => {
    if (activeMath.current?.isConnected) return activeMath.current;
    const list = rowsRef.current;
    const row = list.find((r) => r.id === active) ?? list[list.length - 1];
    if (!row) return null;
    const api = apis.current.get(row.id);
    return row.kind === "equation" ? (api?.mathField() ?? null) : (api?.insertMath("") ?? null);
  };

  const press = (key: Key) => {
    if (disabled) return;
    const mf = targetMath();
    if (!mf) return;
    mf.focus();
    if (key.cmd) mf.executeCommand(key.cmd as never);
    else if (key.latex) mf.insert(key.latex, { format: "latex", selectionMode: "placeholder" });
  };

  const startInline = () => {
    if (disabled) return;
    const list = rowsRef.current;
    const row = list.find((r) => r.id === active) ?? list[list.length - 1];
    if (!row) return;
    if (row.kind === "equation") return addRow("text", row.id);
    apis.current.get(row.id)?.insertMath("");
  };

  // Parts the reading was unsure about: still in the answer and not yet looked at.
  const pending = unsure.filter((u) => !seen[u.text] && rows.some((r) => norm(lineOf(r)).includes(norm(u.text))));
  const rowUnsure = (r: RowState) => pending.some((u) => norm(lineOf(r)).includes(norm(u.text)));

  function jump(part: UnsurePart) {
    const row = rowsRef.current.find((r) => norm(lineOf(r)).includes(norm(part.text)));
    setSeen((s) => ({ ...s, [part.text]: true }));
    if (!row) return;
    setActive(row.id);
    const api = apis.current.get(row.id);
    api?.jump(part.text);
    listRef.current?.querySelector(`[data-row="${row.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const noMouse = (e: React.MouseEvent) => e.preventDefault();
  const over = text.length > MAX_CHARS;

  return (
    <div className="stack-sm math-editor">
      {unsure.length > 0 ? (
        <div className="stack-sm">
          <p className="label">{pending.length > 0 ? `${pending.length} part${pending.length === 1 ? "" : "s"} to check` : "All doubtful parts checked"}</p>
          <div className="row-wrap">
            {unsure.map((u) => {
              const done = seen[u.text] || !rows.some((r) => norm(lineOf(r)).includes(norm(u.text)));
              return (
                <button key={u.text} type="button" className={`chip ${done ? "chip-muted" : "chip-now"}`} onClick={() => jump(u)} title={u.reason ?? undefined}>
                  {u.text}
                  {u.reason ? ` (${u.reason})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mtool" role="toolbar" aria-label="Math editor tools" onMouseDown={noMouse}>
        <div className="mtool-group">
          <span className="label">Insert</span>
          <button type="button" className="mkey mkey-wide" disabled={disabled} onClick={() => addRow("text", active)}>
            Text row
          </button>
          <button type="button" className="mkey mkey-wide" disabled={disabled} onClick={() => addRow("equation", active)}>
            Equation row
          </button>
          <button type="button" className="mkey mkey-wide" disabled={disabled} onClick={startInline} title="Inline math in the sentence. Typing $ does the same.">
            Inline math
          </button>
        </div>
        <div className="mtool-group">
          <span className="label">Math</span>
          {KEYS.map((k) => (
            <button key={k.label + k.title} type="button" className="mkey" title={k.title} aria-label={k.title} disabled={disabled} onClick={() => press(k)}>
              {k.label}
            </button>
          ))}
          <button type="button" className="mkey mkey-wide" aria-pressed={more} aria-expanded={more} onClick={() => setMore((m) => !m)}>
            More
          </button>
        </div>
        {more ? (
          <div className="mtool-more">
            {MORE.map((g) => (
              <div key={g.group} className="mtool-group">
                <span className="label">{g.group}</span>
                {g.keys.map((k) => (
                  <button key={k.label + k.title} type="button" className="mkey" title={k.title} aria-label={k.title} disabled={disabled} onClick={() => press(k)}>
                    {k.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        <div className="mtool-group">
          <span className="label">Row</span>
          <button type="button" className="mkey mkey-wide" disabled={disabled || depth.past === 0} onClick={undo}>
            Undo
          </button>
          <button type="button" className="mkey mkey-wide" disabled={disabled || depth.future === 0} onClick={redo}>
            Redo
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="mrows field-box-math"
        onFocus={(e) => {
          const t = e.target as HTMLElement;
          activeMath.current = t.tagName === "MATH-FIELD" ? (t as MathfieldElement) : null;
          const id = Number(t.closest("[data-row]")?.getAttribute("data-row"));
          if (id) {
            setActive(id);
            const row = rowsRef.current.find((r) => r.id === id);
            if (row) {
              // Putting the caret in a row with a doubtful part counts as looking at it.
              setSeen((s) => {
                const next = { ...s };
                for (const u of unsure) if (norm(lineOf(row)).includes(norm(u.text))) next[u.text] = true;
                return next;
              });
            }
          }
        }}
      >
        {!ml ? <p className="small muted">Loading the math editor...</p> : null}
        {ml
          ? rows.map((r, i) => (
              <div key={`${r.id}-${r.rev}`} data-row={r.id} className={`mrow${active === r.id ? " mrow-active" : ""}${rowUnsure(r) ? " mrow-unsure" : ""}`}>
                <span className="mrow-no" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="mrow-body">
                  {r.kind === "equation" ? (
                    <EquationRow row={r} ml={ml} disabled={disabled} onValue={onValue} onEnter={(id) => addRow("text", id)} onEmptyBackspace={removeRow} register={register} />
                  ) : (
                    <TextRow row={r} ml={ml} disabled={disabled} onValue={onValue} onEnter={(id) => addRow("text", id)} onEmptyBackspace={removeRow} register={register} />
                  )}
                </div>
                <div className="mrow-tools" onMouseDown={noMouse}>
                  <button type="button" className="mkey mkey-small" disabled={disabled} onClick={() => switchKind(r.id)} aria-label={`Row ${i + 1}: switch to ${r.kind === "text" ? "equation" : "text"} row`} title={r.kind === "text" ? "Make this an equation row" : "Make this a text row"}>
                    {r.kind === "text" ? "Eq" : "Tx"}
                  </button>
                  <button type="button" className="mkey mkey-small" disabled={disabled || i === 0} onClick={() => move(r.id, -1)} aria-label={`Move row ${i + 1} up`}>
                    ▲
                  </button>
                  <button type="button" className="mkey mkey-small" disabled={disabled || i === rows.length - 1} onClick={() => move(r.id, 1)} aria-label={`Move row ${i + 1} down`}>
                    ▼
                  </button>
                  <button type="button" className="mkey mkey-small" disabled={disabled} onClick={() => removeRow(r.id)} aria-label={`Delete row ${i + 1}`}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          : null}
      </div>
      <p className="small muted answer-count" style={{ color: over ? "var(--orange)" : undefined }}>
        {text.length} / {MAX_CHARS}
        {over ? " (too long)" : ""}
      </p>
    </div>
  );
}
