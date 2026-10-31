// Pixel icons drawn as dots on a 7 by 7 grid, to match the Doto lettering. "#" is a dot.
const PATTERNS = {
  // Calendar with two rings on top
  semester: [".#...#.", "#######", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"],
  // Open book
  course: [".......", "###.###", "#..#..#", "#..#..#", "#..#..#", "###.###", "...#..."],
  // Paper with a folded corner and lines
  exam: ["#####..", "#...##.", "#.##..#", "#.....#", "#.###.#", "#.....#", "#######"],
  // Two halves side by side
  section: ["###.###", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "###.###"],
  // Two pages, one behind the other
  chapters: ["..#####", "..#...#", "#####.#", "#...#.#", "#...###", "#...#..", "#####.."],
  // Four cards
  set: ["###.###", "#.#.#.#", "###.###", ".......", "###.###", "#.#.#.#", "###.###"],
  // Podium, first place in the middle
  leaderboard: ["..###..", "..#.#..", "###.#..", "#.#.###", "#.#.#.#", "#.#.#.#", "#######"],
  // A person with a plus
  invite: [".##....", "#..#...", ".##..#.", "....###", ".##..#.", "#..#...", "#..#..."],
} as const;

export type DotIconName = keyof typeof PATTERNS;

export function DotIcon({ name }: { name: DotIconName }) {
  const dots = PATTERNS[name].flatMap((row, y) => [...row].flatMap((cell, x) => (cell === "#" ? [{ x, y }] : [])));
  return (
    <svg className="dot-icon" viewBox="0 0 7 7" aria-hidden="true">
      {dots.map(({ x, y }) => (
        <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.4} />
      ))}
    </svg>
  );
}
