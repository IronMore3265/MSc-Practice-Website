"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "@/components/NavLink";
import { markAllNotificationsRead } from "@/app/notifications/actions";

export type NotificationView = {
  id: string;
  sessionId: string;
  failed: boolean; // a marking gave up, the result screen has Retry
  unread: boolean;
  title: string; // "Midterm · Ch 1 Set 2"
  detail: string; // "2 of 6 answers marked" or "All 6 marked · 41/60"
  when: string; // already formatted on the server in Dhaka time
};

// Bell next to Sign out. When CQ answers are marked after the student has left, the count shows here, and each
// item opens that session's result. Opening the result marks it read (see the practice page).
export function NotificationBell({ items }: { items: NotificationView[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => n.unread).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="notif-wrap" ref={box}>
      <button type="button" className={`pill notif-button${unread ? " notif-has" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <BellIcon />
        <span className="sr-only">Notifications</span>
        {unread ? <span className="notif-count">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notif-panel card-shadow" role="dialog" aria-label="Notifications">
          <div className="between">
            <p className="label label-orange">Notifications</p>
            {unread ? (
              <button type="button" className="btn-link small" disabled={pending} onClick={() => startTransition(() => markAllNotificationsRead())}>
                {pending ? "Marking..." : "Mark all read"}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="small muted">Nothing yet. When your written answers are marked, they show up here.</p>
          ) : (
            <div className="notif-list">
              {items.map((n) => (
                <Link key={n.id} href={`/practice/${n.sessionId}`} className={`notif-item${n.unread ? " notif-unread" : ""}`} onClick={() => setOpen(false)}>
                  <span className="between">
                    <span className="notif-title">{n.title}</span>
                    {n.failed ? <span className="chip chip-muted">Retry</span> : n.unread ? <span className="chip chip-now">New</span> : null}
                  </span>
                  <span className="small">{n.detail}</span>
                  <span className="small muted">{n.when}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Lucide bell, drawn in the current text colour.
function BellIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  );
}
