import Link from "@/components/NavLink";
import { adminCourses } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ course?: string }>;

export default async function AdminChaptersPage({ searchParams }: { searchParams: SearchParams }) {
  const { course: courseParam } = await searchParams;
  const supabase = await createClient();

  const courses = await adminCourses(supabase);
  const course = (courses ?? []).find((c) => c.id === courseParam) ?? courses?.[0];
  if (!course) return <p className="small muted">No courses yet. Add one on the Exams tab.</p>;

  const { data: chapters } = await supabase
    .from("chapter")
    .select("*, source_pdf(*), figure(count)")
    .eq("course_id", course.id)
    .order("number");

  const imported = (chapters ?? []).filter((c) => c.source_pdf).length;

  return (
    <section className="stack" style={{ gap: 22 }}>
      <div className="stack-sm">
        <h1 className="heading">
          Chapters{" "}
          <span className="accent">
            {imported}/{(chapters ?? []).length}
          </span>
        </h1>
        <p className="small muted">
          One PDF per chapter. Import and review on your laptop with the import tool, then upload. This page shows what reached the site.
        </p>
      </div>

      <div className="stack-sm">
        <p className="label">Course</p>
        <div className="wrap">
          {(courses ?? []).map((c) => (
            <Link key={c.id} href={`/admin/chapters?course=${c.id}`} className="pill" aria-current={c.id === course.id ? "page" : undefined}>
              {c.short_name ?? c.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="card rows">
        {(chapters ?? []).map((c) => {
          const pdf = c.source_pdf;
          const figures = c.figure[0]?.count ?? 0;
          return (
            <Link key={c.id} href={`/admin/chapters/${c.id}`} className="row row-link">
              <span>
                <span className="row-name">Ch {c.number}</span> <span className="muted">{c.title}</span>
                <span className="small muted" style={{ display: "block" }}>
                  {pdf ? `${pdf.filename} · ${pdf.page_count} pages · ${figures} figure${figures === 1 ? "" : "s"}` : "No PDF imported yet"}
                </span>
              </span>
              {pdf ? (
                pdf.review_status === "reviewed" ? (
                  <span className="chip chip-done">Reviewed</span>
                ) : (
                  <span className="chip chip-now">{pdf.figures_pending} to review</span>
                )
              ) : (
                <span className="chip chip-muted">Empty</span>
              )}
            </Link>
          );
        })}
        {(chapters ?? []).length === 0 ? <p className="small muted">No chapters yet. Add them on the Exams tab.</p> : null}
      </div>
    </section>
  );
}
