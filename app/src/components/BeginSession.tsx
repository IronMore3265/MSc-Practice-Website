"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExamBriefing } from "@/components/ExamBriefing";

type Props = {
  setId: string;
  section: "mcq" | "cq";
  chapterIds?: string[];
  title: string;
  questionCount: number;
  marks: number;
  mcqSeconds: number;
  capLeft: number;
  capLimit: number;
};

// The briefing on the exam screen. Begin creates the session (that starts the MCQ timer) and opens the first question.
export function BeginSession({ setId, section, chapterIds, ...brief }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ set_id: setId, section, chapter_ids: chapterIds }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Could not start the session.");
        setBusy(false);
        return;
      }
      // Replace, so the browser's back button returns home rather than to this briefing.
      router.replace(`/practice/${data.id}`);
    } catch {
      setError("Network problem. Try again.");
      setBusy(false);
    }
  }

  if (brief.questionCount === 0) {
    return (
      <div className="dashed stack-sm">
        <p className="small">There are no {section === "cq" ? "CQ" : "MCQ"}s in this set for the chapters picked.</p>
        <button type="button" className="btn btn-small" onClick={() => router.push("/")}>
          Back to the home screen
        </button>
      </div>
    );
  }

  return (
    <>
      <ExamBriefing section={section} {...brief} busy={busy} onBegin={() => void begin()} onBack={() => router.push("/")} />
      {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}
    </>
  );
}
