"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DotIcon } from "@/components/DotIcons";
import type { InviteView } from "@/lib/invites";

type Props = {
  invites: InviteView[];
  // null means no limit (admin).
  limit: number | null;
};

export function InvitePanel({ invites, limit }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const unused = invites.filter((i) => i.status === "unused").length;
  const full = limit !== null && unused >= limit;

  async function create() {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/invites", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Could not create an invite code." });
      return;
    }
    router.refresh();
  }

  async function copy(code: string) {
    const link = `${window.location.origin}/signup?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setMessage({ ok: true, text: "Invite link copied." });
    } catch {
      setMessage({ ok: false, text: `Copy this link by hand: ${link}` });
    }
  }

  return (
    <section className="card-shadow stack">
      <div className="between">
        <div>
          <p className="label">
            <DotIcon name="invite" />
            Invite a friend
          </p>
          <p className="small muted">
            {limit === null ? `${unused} unused codes` : `${unused} of ${limit} unused codes`}. Each code works once and expires after 7 days.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={create} disabled={pending || full}>
          {pending ? "Creating..." : "New code"}
        </button>
      </div>

      {message ? (
        <p className="form-msg" data-ok={message.ok} role="status">
          {message.text}
        </p>
      ) : null}

      {invites.length > 0 ? (
        <div className="rows">
          {invites.map((i) => (
            <div key={i.id} className="row">
              <div>
                <span className="code">{i.code}</span>
                <p className="small muted">{i.status === "unused" ? `Expires ${i.expires}` : i.status === "used" ? "Used" : `Expired ${i.expires}`}</p>
              </div>
              {i.status === "unused" ? (
                <button type="button" className="btn btn-small" onClick={() => copy(i.code)}>
                  Copy link
                </button>
              ) : (
                <span className="chip chip-muted">{i.status}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="small muted">No codes yet.</p>
      )}
    </section>
  );
}
