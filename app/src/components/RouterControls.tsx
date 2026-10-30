"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// The AI tab: refreshes every few seconds and has a button that runs one router tick now.
// A tick claims the oldest waiting job if a slot is ready. The pages that wait on jobs do this on their own.
export function RouterControls({ waiting }: { waiting: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [router]);

  async function tick() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/admin/router/tick", { method: "POST" });
      setNote(res.ok ? "Tick started. Watch the queue." : "Could not start a tick.");
    } catch {
      setNote("Could not start a tick.");
    }
    setBusy(false);
    setTimeout(() => router.refresh(), 1500);
  }

  return (
    <div className="wrap">
      <button type="button" className="btn btn-small" onClick={tick} disabled={busy || !waiting}>
        {busy ? "Working..." : "Run a tick now"}
      </button>
      {note ? <span className="small muted">{note}</span> : null}
    </div>
  );
}
