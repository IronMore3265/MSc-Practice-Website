"use client";

import { useState } from "react";
import Link from "@/components/NavLink";
import { useRouter } from "next/navigation";

type Props = { setId: string | null; sessionId: string; chapterIds: string[]; missed: number };

// Buttons under the result: retry only the missed questions, retry the whole set, or go back to the home screen.
export function ResultActions({ setId, sessionId, chapterIds, missed }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(which: "missed" | "set") {
    if (!setId) return;
    setBusy(which);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(which === "missed" ? { set_id: setId, retry_of: sessionId } : { set_id: setId, chapter_ids: chapterIds }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not start a new session.");
        setBusy(null);
        return;
      }
      router.push(`/practice/${data.id}`);
    } catch {
      setError("Network problem. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="stack-sm">
      <div className="wrap">
        {setId && missed > 0 ? (
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void start("missed")}>
            {busy === "missed" ? "Starting..." : `Retry missed (${missed})`}
          </button>
        ) : null}
        {setId ? (
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void start("set")}>
            {busy === "set" ? "Starting..." : "Retry set"}
          </button>
        ) : null}
        <Link href="/" className="btn btn-primary">
          New session
        </Link>
      </div>
      {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}
    </div>
  );
}
