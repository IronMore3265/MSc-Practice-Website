import { ActionForm } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { Profile } from "@/lib/database.types";
import { resetStudentPassword, setLeaderboard, setStudentLimits, setStudentStatus } from "./actions";

const ORDER = { pending: 0, active: 1, disabled: 2 } as const;

function StatusChip({ profile }: { profile: Profile }) {
  if (profile.status === "pending") return <span className="chip chip-now">Pending, approve</span>;
  if (profile.status === "active") return <span className="chip chip-done">Active</span>;
  return <span className="chip chip-muted">Disabled</span>;
}

export default async function StudentsPage() {
  const { profile: me } = await requireAdmin();
  const supabase = await createClient();
  const [{ data }, { data: setting }] = await Promise.all([
    supabase.from("profile").select("*").order("created_at"),
    supabase.from("app_setting").select("leaderboard_on").eq("id", 1).maybeSingle(),
  ]);
  const leaderboardOn = setting?.leaderboard_on ?? false;

  const people = [...(data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const pending = people.filter((p) => p.status === "pending").length;

  return (
    <section className="stack">
      <div className="stack-sm">
        <h1 className="heading">
          Students <span className="accent">{people.length}</span>
        </h1>
        <p className="small muted">
          {pending > 0 ? `${pending} waiting for approval. ` : ""}Rejecting an account switches it off. You can switch it back on later.
        </p>
      </div>

      <div className="card-shadow between">
        <div className="stack-sm">
          <p className="label">
            Leaderboard <span className={`chip${leaderboardOn ? " chip-done" : " chip-muted"}`}>{leaderboardOn ? "On" : "Off"}</span>
          </p>
          <p className="small muted">
            Average MCQ % per exam on the home screen. Students join it themselves, and only sets they start after joining count.
          </p>
        </div>
        <ActionForm action={setLeaderboard} submitLabel={leaderboardOn ? "Turn off" : "Turn on"} buttonClass={`btn btn-small${leaderboardOn ? "" : " btn-primary"}`}>
          <input type="hidden" name="on" value={leaderboardOn ? "false" : "true"} />
        </ActionForm>
      </div>

      <div className="card rows">
        {people.map((p) => {
          const self = p.id === me.id;
          return (
            <div key={p.id} className="student">
              <div className="between">
                <div>
                  <p className="row-name">
                    {p.name} {p.role === "admin" ? <span className="chip">Admin</span> : null}
                  </p>
                  <p className="small muted">
                    {p.email}
                    {p.invited_by ? ` · invited by ${names.get(p.invited_by) ?? "a removed member"}` : p.role === "admin" ? "" : " · no inviter"}
                  </p>
                </div>
                <StatusChip profile={p} />
              </div>

              {self ? null : (
                <>
                  <div className="wrap">
                    {p.status === "pending" ? (
                      <>
                        <ActionForm action={setStudentStatus} submitLabel="Approve" buttonClass="btn btn-small btn-primary" className="wrap">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="to" value="active" />
                        </ActionForm>
                        <ActionForm action={setStudentStatus} submitLabel="Reject" buttonClass="btn btn-small" className="wrap" confirmText={`Reject ${p.name}?`}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="to" value="disabled" />
                        </ActionForm>
                      </>
                    ) : p.status === "active" ? (
                      <ActionForm action={setStudentStatus} submitLabel="Disable" buttonClass="btn btn-small" className="wrap" confirmText={`Disable ${p.name}?`}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="to" value="disabled" />
                      </ActionForm>
                    ) : (
                      <ActionForm action={setStudentStatus} submitLabel="Enable" buttonClass="btn btn-small" className="wrap">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="to" value="active" />
                      </ActionForm>
                    )}
                  </div>

                  <div className="wrap" style={{ alignItems: "flex-start", gap: 20 }}>
                    <ActionForm action={setStudentLimits} submitLabel="Save limits" buttonClass="btn btn-small" className="inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="field">
                        <label className="label" htmlFor={`cap-${p.id}`}>Daily AI cap</label>
                        <input id={`cap-${p.id}`} name="daily_cap" inputMode="numeric" className="input input-sm" defaultValue={p.daily_cap} />
                      </div>
                      <div className="field">
                        <label className="label" htmlFor={`inv-${p.id}`}>Invite limit</label>
                        <input id={`inv-${p.id}`} name="invite_limit" inputMode="numeric" className="input input-sm" defaultValue={p.invite_limit} />
                      </div>
                    </ActionForm>
                    <ActionForm action={resetStudentPassword} submitLabel="Set password" buttonClass="btn btn-small" className="inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="field">
                        <label className="label" htmlFor={`pw-${p.id}`}>New password</label>
                        <input id={`pw-${p.id}`} name="password" type="text" autoComplete="off" className="input input-sm" minLength={8} />
                      </div>
                    </ActionForm>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {people.length === 0 ? <p className="small muted">No accounts yet.</p> : null}
      </div>
    </section>
  );
}
