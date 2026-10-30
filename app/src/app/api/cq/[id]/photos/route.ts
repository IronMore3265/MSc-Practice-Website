import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/practice";
import { practiceError, readJson, requireUserClient } from "@/lib/practice-api";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_500_000; // the phone compresses to about 300 KB, so this is generous
const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const BUCKET = "answer-photos";

// A JPEG starts with FF D8 FF. The phone sends JPEG after compressing, anything else is refused.
function looksLikeJpeg(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// Add one answer photo. Multipart body: session_id, file. The id in the path is the question id.
// The photo goes into the student's own folder with the student's own session (storage policies apply),
// then the database function registers it on the attempt and enforces the limit of 4.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The photo could not be read." }, { status: 400 });
  }
  const sessionId = form.get("session_id");
  const file = form.get("file");
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return NextResponse.json({ error: "Missing session." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too big." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeJpeg(bytes)) return NextResponse.json({ error: "Only photos are accepted." }, { status: 415 });

  // Row level security shows the student only their own attempt, so this finds the right folder or nothing.
  const { data: attempt } = await auth.supabase
    .from("attempt")
    .select("id")
    .eq("session_run_id", sessionId)
    .eq("question_id", id)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const name = `${randomUUID()}.jpg`;
  const path = `${auth.user.id}/${attempt.id}/${name}`;
  const { error: uploadError } = await auth.supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) return NextResponse.json({ error: "The photo did not upload. Try again." }, { status: 502 });

  const { data, error } = await auth.supabase.rpc("add_cq_photo", { p_session: sessionId, p_question: id, p_path: path });
  if (error) {
    await auth.supabase.storage.from(BUCKET).remove([path]); // no orphan files when the database said no
    return practiceError(error);
  }
  return NextResponse.json({ ...(data as object), file: name }, { status: 201 });
}

// Remove one photo ({ session_id, file }) or all of them to start over ({ session_id, all: true }).
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireUserClient();
  if (auth.denied) return auth.denied;

  const body = await readJson(request);
  const sessionId = body?.session_id;
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) return NextResponse.json({ error: "Missing session." }, { status: 400 });

  let paths: string[];
  if (body?.all === true) {
    const { data, error } = await auth.supabase.rpc("reset_cq_photos", { p_session: sessionId, p_question: id });
    if (error) return practiceError(error);
    paths = data ?? [];
  } else {
    const file = body?.file;
    if (typeof file !== "string" || !FILE_RE.test(file)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const { data, error } = await auth.supabase.rpc("remove_cq_photo", { p_session: sessionId, p_question: id, p_file: file });
    if (error) return practiceError(error);
    paths = data ? [data] : [];
  }
  if (paths.length) await auth.supabase.storage.from(BUCKET).remove(paths);
  return NextResponse.json({ ok: true });
}
