"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Polls the given jobs. Each poll also nudges the server router to run a tick (plan 5b).
// When a job finishes or fails, the page is refreshed so new questions and statuses show up.
export function JobWatcher({ jobIds, everyMs = 4000 }: { jobIds: string[]; everyMs?: number }) {
  const router = useRouter();
  const key = jobIds.join(",");
  const last = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!key) return;
    let stopped = false;
    const ids = key.split(",");

    async function poll() {
      let changed = false;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
          if (!res.ok) continue;
          const { job } = (await res.json()) as { job: { status: string } };
          if (last.current[id] && last.current[id] !== job.status) changed = true;
          last.current[id] = job.status;
          if (job.status === "done" || job.status === "failed") changed = true;
        } catch {
          // Network hiccup: try again on the next beat.
        }
      }
      if (changed && !stopped) router.refresh();
    }

    void poll();
    const timer = setInterval(poll, everyMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [key, everyMs, router]);

  return null;
}
