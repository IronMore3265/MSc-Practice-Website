import Link from "next/link";
import { InvitePanel } from "@/components/InvitePanel";
import { requireActive } from "@/lib/auth";
import { toInviteViews } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

function formatLabel(format: string) {
  return format === "both" ? ["MCQ", "CQ"] : [format.toUpperCase()];
}

export default async function HomePage() {
  const { profile } = await requireActive();
  const supabase = await createClient();

  const [{ data: courses }, { data: invites }] = await Promise.all([
    supabase
      .from("course")
      .select("id, name, short_name, exam(id, name, weight, format, sort_order)")
      .order("sort_order"),
    supabase.from("invite").select("*").eq("created_by", profile.id).order("created_at", { ascending: false }),
  ]);

  const isAdmin = profile.role === "admin";

  return (
    <main className="shell shell-wide">
      <div className="between">
        <span className="label">Exam Practice Studio</span>
        <div className="wrap">
          {isAdmin ? (
            <Link href="/admin" className="pill">
              Admin
            </Link>
          ) : null}
          <form action={signOut}>
            <button type="submit" className="btn btn-small">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="stack-sm">
        <h1 className="title">
          Pick your <span className="accent">Exam</span>
        </h1>
        <p className="muted">Hi {profile.name}. Practice sessions arrive in a later phase. For now you can see your courses and invite friends.</p>
      </div>

      <section className="stack">
        {(courses ?? []).map((course) => (
          <div key={course.id} className="card stack-sm">
            <p className="label">{course.short_name ?? course.name}</p>
            <div className="rows">
              {[...course.exam]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((exam) => (
                  <div key={exam.id} className="row">
                    <div>
                      <p className="row-name">{exam.name}</p>
                      <p className="small muted">{Number(exam.weight)}%</p>
                    </div>
                    <div className="wrap">
                      {formatLabel(exam.format).map((f) => (
                        <span key={f} className="chip">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>

      <InvitePanel invites={toInviteViews(invites ?? [])} limit={isAdmin ? null : profile.invite_limit} />

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
