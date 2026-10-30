import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/practice";
import { practiceError, readJson, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";

// Start a session from a set. The database picks the questions. MCQ sessions set the countdown, CQ sessions have none.
// Body: { set_id, section?: "mcq" | "cq", chapter_ids?: uuid[], retry_of?: uuid }. Starting a session makes no AI calls.
export async function POST(request: Request) {
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const body = await readJson(request);
  const setId = body?.set_id;
  const chapterIds = body?.chapter_ids;
  const retryOf = body?.retry_of;
  if (typeof setId !== "string" || !UUID_RE.test(setId)) return NextResponse.json({ error: "Pick a set first." }, { status: 400 });
  if (
    chapterIds != null &&
    (!Array.isArray(chapterIds) || chapterIds.length > 50 || !chapterIds.every((c) => typeof c === "string" && UUID_RE.test(c)))
  ) {
    return NextResponse.json({ error: "Invalid chapters." }, { status: 400 });
  }
  if (retryOf != null && (typeof retryOf !== "string" || !UUID_RE.test(retryOf))) {
    return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  }

  const section = body?.section ?? "mcq";
  if (section !== "mcq" && section !== "cq") return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  if (section === "cq") {
    if (retryOf != null) return NextResponse.json({ error: "CQ sessions cannot retry missed questions." }, { status: 400 });
    const { data, error } = await auth.supabase.rpc("start_cq_session", {
      p_set_id: setId,
      p_chapter_ids: (chapterIds as string[] | null | undefined) ?? undefined,
    });
    if (error) return practiceError(error);
    return NextResponse.json({ id: data }, { status: 201 });
  }

  const { data, error } = await auth.supabase.rpc("start_mcq_session", {
    p_set_id: setId,
    p_chapter_ids: (chapterIds as string[] | null | undefined) ?? undefined,
    p_retry_of: (retryOf as string | null | undefined) ?? undefined,
  });
  if (error) return practiceError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
