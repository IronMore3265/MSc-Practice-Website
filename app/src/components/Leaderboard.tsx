"use client";

import { useEffect, useState } from "react";
import { DotIcon } from "@/components/DotIcons";

type Row = { rank: number; name: string; avgPercent: number; sessions: number; isMe: boolean };

// Home side column: average MCQ % for the exam picked on the left. Students join it themselves,
// and only sets started after joining count.
export function Leaderboard({ examId, examName, joined: joinedAtLoad }: { examId: string; examName: string; joined: boolean }) {
  // The last answer, tagged with the request it belongs to, so a new exam shows "Loading..." until its own answer arrives.
  const [result, setResult] = useState<{ key: string; rows: Row[] | null; error: string | null } | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [joined, setJoined] = useState(joinedAtLoad);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const key = `${examId}|${reload}`;
  const current = result?.key === key ? result : null;
  const rows = current?.rows ?? null;
  const error = toggleError ?? current?.error ?? null;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/exams/${examId}/leaderboard`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = (await res.json()) as { rows?: Row[]; error?: string };
        if (!res.ok || !data.rows) throw new Error(data.error ?? "Could not load the leaderboard.");
        setResult({ key, rows: data.rows, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setResult({ key, rows: null, error: e instanceof Error ? e.message : "Could not load the leaderboard." });
      });
    return () => ctrl.abort();
  }, [examId, key]);

  async function toggle() {
    if (joined && !window.confirm("Leave the leaderboard? If you join again later, only sets you start after that will count.")) return;
    setBusy(true);
    setToggleError(null);
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: !joined }),
      });
      const data = (await res.json()) as { joined?: boolean; error?: string };
      if (!res.ok || data.joined === undefined) {
        setToggleError(data.error ?? "Could not change that. Try again.");
        return;
      }
      setJoined(data.joined);
      setReload((n) => n + 1);
    } catch {
      setToggleError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-shadow stack">
      <div className="stack-sm">
        <p className="label section-label">
          <DotIcon name="leaderboard" />
          Leaderboard · {examName}
        </p>
        <p className="small muted">Average MCQ score over full sets. Your answers stay private.</p>
      </div>

      {rows === null && !error ? <p className="small muted">Loading...</p> : null}
      {rows && rows.length === 0 ? <p className="small muted">No scores yet. Join and finish a set to be the first.</p> : null}
      {rows && rows.length > 0 ? (
        <ol className="lb">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={`lb-row${r.isMe ? " lb-me" : ""}`}>
              <span className="lb-rank">{r.rank}</span>
              <span className="lb-name">
                {r.name}
                {r.isMe ? " (you)" : ""}
              </span>
              <span className="small lb-sets">
                {r.sessions} set{r.sessions === 1 ? "" : "s"}
              </span>
              <span className="lb-pct">{r.avgPercent}%</span>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

      <div className="between">
        <p className="small muted">{joined ? "You are on the leaderboard." : "Only MCQ sets you start after joining count."}</p>
        <button type="button" className={`btn btn-small${joined ? "" : " btn-primary"}`} disabled={busy} onClick={() => void toggle()}>
          {busy ? "Working..." : joined ? "Leave" : "Join"}
        </button>
      </div>
    </section>
  );
}
