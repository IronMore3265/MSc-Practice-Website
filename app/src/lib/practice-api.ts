import "server-only";
import { NextResponse } from "next/server";
import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

// The signed-in user and a client that carries their session, so row level security and the database
// functions see them as auth.uid(). Returns a ready 401 response when nobody is signed in.
export async function requireUserClient(): Promise<
  { supabase: SupabaseClient<Database>; user: User; denied?: undefined } | { denied: NextResponse; supabase?: undefined; user?: undefined }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { denied: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  return { supabase, user };
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Turns the error names the practice functions raise into a status code and a plain message.
export function practiceError(error: PostgrestError) {
  const m = error.message;
  if (error.code === "42501") return NextResponse.json({ error: "Your account is not approved yet." }, { status: 403 });
  if (m.includes("unknown_set") || m.includes("unknown_session") || m.includes("unknown_question")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (m.includes("no_questions")) {
    return NextResponse.json({ error: "No questions to practice with the chapters you picked. Try another set or more chapters." }, { status: 409 });
  }
  if (m.includes("already_answered")) return NextResponse.json({ error: "You already answered this question." }, { status: 409 });
  if (m.includes("session_finished")) return NextResponse.json({ error: "This session is finished." }, { status: 409 });
  if (m.includes("answer_too_short")) return NextResponse.json({ error: "Write a little more before you submit." }, { status: 400 });
  if (m.includes("answer_too_long")) return NextResponse.json({ error: "That answer is too long. Keep it under 8000 characters." }, { status: 400 });
  if (m.includes("daily_cap_reached")) {
    return NextResponse.json({ error: "You have used all your AI gradings for today. They reset at midnight, Bangladesh time." }, { status: 429 });
  }
  if (m.includes("too_many_photos")) return NextResponse.json({ error: "You can attach up to 4 photos to one answer." }, { status: 409 });
  if (m.includes("photos_locked")) return NextResponse.json({ error: "These photos are already being read. Start over to change them." }, { status: 409 });
  if (m.includes("no_photos")) return NextResponse.json({ error: "Add at least one photo first." }, { status: 400 });
  if (m.includes("too_many_readings")) {
    return NextResponse.json({ error: "Your photos were read three times already. Type the answer, or start a new question." }, { status: 429 });
  }
  if (m.includes("still_reading")) return NextResponse.json({ error: "Your photos are still being read. Wait a moment." }, { status: 409 });
  if (m.includes("unknown_photo")) return NextResponse.json({ error: "That photo is not on this answer." }, { status: 404 });
  if (m.includes("bad_photo_path") || m.includes("photo_missing")) return NextResponse.json({ error: "The photo did not upload. Try again." }, { status: 400 });
  if (m.includes("unknown_option")) return NextResponse.json({ error: "That option does not belong to this question." }, { status: 400 });
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
