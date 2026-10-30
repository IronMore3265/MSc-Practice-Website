import type { SessionFigure } from "@/lib/practice";

// The original figure from the PDF, never redrawn. The caption shows the label, source file and page.
export function FigureCard({ figure }: { figure: SessionFigure }) {
  const label = figure.label ?? "Figure";
  return (
    <figure className="figure-card">
      <p className="label">Refer to {label}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, login-protected route, not an optimizable static image */}
      <img src={`/api/figures/${figure.id}`} alt={figure.caption ?? `${label} on page ${figure.page}`} />
      <figcaption className="small muted">
        {label}, {figure.filename}, p. {figure.page}. Original image, not redrawn.
      </figcaption>
    </figure>
  );
}
