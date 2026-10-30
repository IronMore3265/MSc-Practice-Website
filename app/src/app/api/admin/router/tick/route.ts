import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth";
import { runTick } from "@/lib/ai/router";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Admin only: run one router tick now (the AI tab uses this to push the queue along).
export async function POST() {
  const session = await getSession();
  if (!session || session.profile?.role !== "admin" || session.profile.status !== "active") {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  after(async () => {
    await runTick();
  });
  return NextResponse.json({ ok: true });
}
