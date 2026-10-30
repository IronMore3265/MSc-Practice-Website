"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "Retry" for a grading job that failed. The answer is already saved, this only puts the job back in the queue.
export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Could not retry. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="wrap">
      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void retry()}>
        {busy ? "Queueing..." : "Retry marking"}
      </button>
      {error ? <span className="small muted">{error}</span> : null}
    </span>
  );
}
