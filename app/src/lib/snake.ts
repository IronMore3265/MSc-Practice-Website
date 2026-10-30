// Snake rules for the waiting game (plan 5c). Pure functions, the component only draws and listens.
// It runs fully in the browser and makes no API calls.

export type Dir = "up" | "down" | "left" | "right";
export type Pt = { x: number; y: number };
export type SnakeState = { size: number; snake: Pt[]; dir: Dir; food: Pt; score: number; over: boolean };

const DELTA: Record<Dir, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export type Rng = () => number;

function placeFood(size: number, snake: Pt[], rng: Rng): Pt {
  const taken = new Set(snake.map((p) => p.y * size + p.x));
  const free: number[] = [];
  for (let i = 0; i < size * size; i++) if (!taken.has(i)) free.push(i);
  const pick = free[Math.floor(rng() * free.length)] ?? 0;
  return { x: pick % size, y: Math.floor(pick / size) };
}

export function newGame(size = 14, rng: Rng = Math.random): SnakeState {
  const mid = Math.floor(size / 2);
  const snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  return { size, snake, dir: "right", food: placeFood(size, snake, rng), score: 0, over: false };
}

// The snake cannot turn straight back on itself.
export function turn(current: Dir, wanted: Dir): Dir {
  return wanted === OPPOSITE[current] ? current : wanted;
}

// One tick. Hitting a wall or yourself ends the game. Eating food grows the snake and scores a point.
export function step(state: SnakeState, wanted: Dir, rng: Rng = Math.random): SnakeState {
  if (state.over) return state;
  const dir = turn(state.dir, wanted);
  const head = state.snake[0];
  const next = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };
  const ate = next.x === state.food.x && next.y === state.food.y;
  // The tail moves away this tick unless we ate, so stepping onto the current tail is allowed.
  const body = ate ? state.snake : state.snake.slice(0, -1);
  const hitWall = next.x < 0 || next.y < 0 || next.x >= state.size || next.y >= state.size;
  if (hitWall || body.some((p) => p.x === next.x && p.y === next.y)) return { ...state, dir, over: true };

  const snake = [next, ...body];
  if (!ate) return { ...state, dir, snake };
  const full = snake.length === state.size * state.size;
  return { ...state, dir, snake, score: state.score + 1, food: full ? state.food : placeFood(state.size, snake, rng), over: full };
}

// Milliseconds per tick: starts easy, speeds up a little with each point, never faster than 70.
export function tickMs(score: number) {
  return Math.max(70, 150 - score * 4);
}
