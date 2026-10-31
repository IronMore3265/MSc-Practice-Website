// The site name at the top of the page. A quill writes it, the words shrink away, and it writes them again.
// CSS only (globals.css, "Brand title"), so it works in server components. It holds still with reduced motion.
export function BrandTitle() {
  return (
    <p className="brand">
      <span className="brand-write">
        <span className="brand-text">
          Exam Practice <span className="accent">Studio</span>
        </span>
        <span className="brand-track" aria-hidden="true">
          <span className="brand-quill">
            <Quill />
          </span>
        </span>
      </span>
    </p>
  );
}

// A feather pen leaning right, nib at the bottom left where it touches the page.
function Quill() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M8.5 24 C9 14 17 5.5 29.5 2 C27.5 12.5 20 21 10.5 25.5 Z" style={{ fill: "var(--ink)" }} />
      <path d="M8.5 24.5 L28.5 3 M13 19.5 l4.5 -0.6 M16.5 15.5 l5 -0.8 M20.5 11 l4.5 -0.9 M11 18 l-0.3 -3.5 M14.5 13.5 l-0.2 -3.8 M18.5 9 l-0.1 -3.4" style={{ stroke: "var(--bg)", strokeWidth: 1, strokeLinecap: "round", fill: "none" }} />
      <path d="M9 23.5 L5 28" style={{ stroke: "var(--ink)", strokeWidth: 1.6, strokeLinecap: "round" }} />
      <path d="M2.5 30.5 L4.2 25.6 L7.4 27.6 Z" style={{ fill: "var(--orange)", stroke: "var(--ink)", strokeWidth: 0.9, strokeLinejoin: "round" }} />
    </svg>
  );
}
