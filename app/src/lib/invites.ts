import type { Invite } from "@/lib/database.types";

export type InviteView = { id: string; code: string; status: "unused" | "used" | "expired"; expires: string };

// Plain data for the invite list, computed on the server so the client never needs the clock.
export function toInviteViews(invites: Invite[], now = Date.now()): InviteView[] {
  return invites.map((i) => ({
    id: i.id,
    code: i.code,
    status: i.used_at ? "used" : new Date(i.expires_at).getTime() <= now ? "expired" : "unused",
    expires: i.expires_at.slice(0, 10),
  }));
}
