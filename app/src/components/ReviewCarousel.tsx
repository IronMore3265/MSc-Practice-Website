"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@/components/Icons";

export type ReviewSlide = { key: string; title: string; meta: string; tag?: { text: string; tone: "right" | "wrong" | "muted" }; content: ReactNode };

// One question at a time instead of a long list: chevrons, arrow keys or a swipe move between them, and the
// numbered chips jump straight to one. Screen only; the printed report lists every question in full.
export function ReviewCarousel({ label, slides, empty }: { label: string; slides: ReviewSlide[]; empty: string }) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  if (slides.length === 0) {
    return (
      <div className="stack-sm">
        <p className="label">{label}</p>
        <p className="small muted">{empty}</p>
      </div>
    );
  }

  const i = Math.min(index, slides.length - 1);
  const slide = slides[i];
  const go = (to: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, to));
    setIndex(next);
    strip.current?.children[next]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };

  return (
    <section
      className="stack-sm carousel"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === "ArrowRight") go(i + 1);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="between">
        <p className="label">
          {label} · {i + 1} of {slides.length}
        </p>
        <div className="nav-buttons">
          <button type="button" className="btn btn-icon" aria-label="Previous question" title="Previous question" disabled={i === 0} onClick={() => go(i - 1)}>
            <ChevronLeft />
          </button>
          <button type="button" className="btn btn-icon btn-primary" aria-label="Next question" title="Next question" disabled={i === slides.length - 1} onClick={() => go(i + 1)}>
            <ChevronRight />
          </button>
        </div>
      </div>

      {slides.length > 1 ? (
        <div className="carousel-strip" ref={strip} role="tablist" aria-label="Jump to a question">
          {slides.map((s, k) => (
            <button key={s.key} type="button" role="tab" aria-selected={k === i} className={`pill${k === i ? " pill-active" : ""}`} onClick={() => go(k)}>
              {s.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="card stack-sm" role="group" aria-roledescription="slide" aria-label={`${slide.title}, ${i + 1} of ${slides.length}`}>
        <div className="between">
          <span className="row-name">{slide.title}</span>
          <span className="wrap">
            <span className="small muted">{slide.meta}</span>
            {slide.tag ? <span className={`chip ${slide.tag.tone === "right" ? "chip-right" : slide.tag.tone === "wrong" ? "chip-wrong" : "chip-muted"}`}>{slide.tag.text}</span> : null}
          </span>
        </div>
        {slide.content}
      </div>
    </section>
  );
}
