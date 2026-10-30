import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A figure image for signed-in, approved members. The bucket is private and row level security decides
// who can see the figure row and the file, so a pending or signed-out visitor gets nothing.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: figure } = await supabase.from("figure").select("blob_path, mime_type, sha256").eq("id", id).maybeSingle();
  if (!figure) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const etag = `"${figure.sha256}"`;
  const headers = { ETag: etag, "Cache-Control": "private, max-age=3600" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

  const { data: file, error } = await supabase.storage.from("figures").download(figure.blob_path);
  if (error || !file) return NextResponse.json({ error: "Could not load the figure." }, { status: 502 });

  return new Response(file, { headers: { ...headers, "Content-Type": figure.mime_type } });
}
