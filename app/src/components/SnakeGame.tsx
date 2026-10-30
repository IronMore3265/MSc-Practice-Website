"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { newGame, step, tickMs, type Dir, type SnakeState } from "@/lib/snake";

const CELL = 20;
const SIZE = 14;
const INK = "#1c1a16";
const BG = "#f2efe8";
const ORANGE = "#ff6b1a";
const BEST_KEY = "snake-best";

const KEYS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

function draw(ctx: CanvasRenderingContext2D, s: SnakeState) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE * CELL, SIZE * CELL);
  ctx.fillStyle = ORANGE;
  ctx.fillRect(s.food.x * CELL + 3, s.food.y * CELL + 3, CELL - 6, CELL - 6);
  s.snake.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? ORANGE : INK;
    ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    if (i === 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4);
    }
  });
}

// Snake in the pixel style (plan 5c). Runs fully in the browser and makes no API calls. Arrow keys or WASD on a
// laptop, swipe on a phone. The best score is kept in this browser. It is never stopped when the result arrives.
const BEST_EVENT = "snake-best";
const subscribeBest = (notify: () => void) => {
  window.addEventListener(BEST_EVENT, notify);
  return () => window.removeEventListener(BEST_EVENT, notify);
};
// Private mode or blocked storage: the game still works, it just forgets the best score.
const readBest = () => {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

// Snake in the pixel style (plan 5c). Runs fully in the browser and makes no API calls. Arrow keys or WASD on a
// laptop, swipe on a phone. The best score is kept in this browser. It is never stopped when the result arrives.
export function SnakeGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<SnakeState>(newGame(SIZE));
  const want = useRef<Dir>("right");
  const [phase, setPhase] = useState<"idle" | "playing" | "paused" | "over">("idle");
  const [score, setScore] = useState(0);
  const best = useSyncExternalStore(subscribeBest, readBest, () => 0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) draw(ctx, state.current);
  }, []);

  // The game loop lives in one effect: it runs while the phase is "playing" and stops itself on any other phase.
  useEffect(() => {
    if (phase !== "playing") return;
    let id: ReturnType<typeof setTimeout>;
    function run() {
      const next = step(state.current, want.current);
      state.current = next;
      const ctx = canvas.current?.getContext("2d");
      if (ctx) draw(ctx, next);
      setScore(next.score);
      if (next.over) {
        if (next.score > readBest()) {
          try {
            window.localStorage.setItem(BEST_KEY, String(next.score));
          } catch {
            // ignore
          }
          window.dispatchEvent(new Event(BEST_EVENT));
        }
        setPhase("over");
        return;
      }
      id = setTimeout(run, tickMs(next.score));
    }
    id = setTimeout(run, tickMs(state.current.score));
    return () => clearTimeout(id);
  }, [phase]);

  const start = useCallback(() => {
    if (state.current.over) {
      state.current = newGame(SIZE);
      want.current = "right";
      setScore(0);
      const ctx = canvas.current?.getContext("2d");
      if (ctx) draw(ctx, state.current);
    }
    setPhase("playing");
  }, []);

  const pause = useCallback(() => setPhase((p) => (p === "playing" ? "paused" : p)), []);

  // Keys steer only while a game is running, so scrolling the page with the arrow keys never starts one.
  // While playing, the arrow keys are taken from the page (no scrolling).
  useEffect(() => {
    if (phase !== "playing") return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!dir) return;
      e.preventDefault();
      want.current = dir;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [pause]);

  function steer(dir: Dir) {
    want.current = dir;
    if (phase !== "playing") start();
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const from = touch.current;
    touch.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  }

  return (
    <div className="game stack-sm">
      <div className="between">
        <p className="label">Snake while you wait</p>
        <p className="label">
          Score <span className="label-orange">{score}</span> · Best {best}
        </p>
      </div>
      <canvas
        ref={canvas}
        width={SIZE * CELL}
        height={SIZE * CELL}
        aria-label="Snake game board"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />
      <div className="between">
        <p className="small muted">{phase === "over" ? "Game over." : "Press Start. Arrow keys or WASD, or swipe on the board."}</p>
        {phase === "playing" ? (
          <button type="button" className="btn btn-small" onClick={pause}>
            Pause
          </button>
        ) : (
          <button type="button" className="btn btn-small btn-primary" onClick={start}>
            {phase === "over" ? "Play again" : phase === "paused" ? "Resume" : "Start"}
          </button>
        )}
      </div>
    </div>
  );
}
