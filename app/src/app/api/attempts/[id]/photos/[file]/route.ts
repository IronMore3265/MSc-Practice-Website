import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/practice";
import { requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";

const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

// One of the student's own answer photos. Row level security shows the attempt only to its owner, the file must be
// listed on that attempt, and the storage policy allows only the owner's folder. The photo is never cached.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  if (!UUID_RE.test(id) || !FILE_RE.test(file)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const { data: attempt } = await auth.supabase.from("attempt").select("photo_paths").eq("id", id).maybeSingle();
  const path = `${auth.user.id}/${id}/${file}`;
  if (!attempt || !attempt.photo_paths.includes(path)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: blob, error } = await auth.supabase.storage.from("answer-photos").download(path);
  if (error || !blob) return NextResponse.json({ error: "Could not load the photo." }, { status: 502 });
  return new Response(blob, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
}
