"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Usage counts and data export arrive with Phase 8.
const TABS = [
  { href: "/admin", label: "Exams" },
  { href: "/admin/chapters", label: "Chapters" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/sets", label: "Sets" },
  { href: "/admin/ai", label: "AI router" },
  { href: "/admin/students", label: "Students" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="wrap" aria-label="Admin sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="pill" aria-current={(t.href === "/admin" ? pathname === t.href : pathname.startsWith(t.href)) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
