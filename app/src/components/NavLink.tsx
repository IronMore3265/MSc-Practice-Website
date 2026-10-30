"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

// Marks the link while its page is on the way, so a click shows at once (styled by a:has(> .nav-pending)).
function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <span className="nav-pending" aria-hidden /> : null;
}

// next/link with that mark. Every link in the app uses this one.
export default function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      <PendingMark />
      {children}
    </Link>
  );
}
