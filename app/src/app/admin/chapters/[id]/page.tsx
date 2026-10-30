import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChapterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("chapter").select("*, course(name, short_name), source_pdf(*)").eq("id", id).maybeSingle();
  if (!chapter) notFound();

  const pdf = chapter.source_pdf;
  const { data: figures } = await supabase.from("figure").select("*").eq("chapter_id", id).order("page").order("created_at");

  // Page text is admin only. Count the pages that have any so a bad extraction stands out.
  const { data: pages } = pdf ? await supabase.from("page_text").select("page, text").eq("pdf_id", pdf.id).order("page") : { data: [] };
  const textPages = (pages ?? []).filter((p) => p.text.trim().length >= 20).length;
  const chars = (pages ?? []).reduce((n, p) => n + p.text.length, 0);

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <Link href={`/admin/chapters?course=${chapter.course_id}`} className="label">
          Back to chapters
        </Link>
        <h1 className="heading">
          Ch {chapter.number} <span className="accent">{chapter.title}</span>
        </h1>
        <p className="small muted">{chapter.course?.short_name ?? chapter.course?.name}</p>
      </div>

      {pdf ? (
        <div className="card stack-sm">
          <div className="between">
            <span className="row-name">{pdf.filename}</span>
            {pdf.review_status === "reviewed" ? (
              <span className="chip chip-done">Reviewed</span>
            ) : (
              <span className="chip chip-now">{pdf.figures_pending} to review</span>
            )}
          </div>
          <p className="small muted">
            {pdf.page_count} pages · text on {textPages} of {pages?.length ?? 0} stored pages · {chars.toLocaleString("en")} characters · imported{" "}
            {new Date(pdf.imported_at).toLocaleDateString("en-GB")}
          </p>
          {pdf.pages_without_text > 0 ? (
            <p className="small">
              <span className="label label-orange">Check</span> {pdf.pages_without_text} page(s) had no text when imported. Scanned pages are not read by this tool.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="dashed">
          <p className="small">No PDF imported for this chapter yet. See import-tool/README.md.</p>
        </div>
      )}

      {(figures ?? []).length > 0 ? (
        <div className="stack-sm">
          <p className="label">Figures, original copies from the PDF</p>
          <div className="gallery">
            {(figures ?? []).map((f) => (
              <figure key={f.id} className="figure-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, login-protected route, not an optimizable static image */}
                <img src={`/api/figures/${f.id}`} alt={f.label ?? `Figure on page ${f.page}`} loading="lazy" />
                <figcaption className="small">
                  <span className="row-name">{f.label ?? "Figure"}</span> · page {f.page}
                  {f.caption ? (
                    <span className="muted" style={{ display: "block" }}>
                      {f.caption}
                    </span>
                  ) : null}
                  <span className="label" style={{ display: "block", marginTop: 4 }}>
                    {f.source === "embedded" ? "Original image bytes" : "Rendered from the PDF"} · {f.width} x {f.height}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : pdf ? (
        <p className="small muted">No approved figures uploaded for this chapter.</p>
      ) : null}
    </section>
  );
}
