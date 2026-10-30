"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Phase 1 has two tabs. Courses, questions, sets and the AI router arrive in later phases.
const TABS = [
  { href: "/admin", label: "Exams" },
  { href: "/admin/students", label: "Students" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="wrap" aria-label="Admin sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="pill" aria-current={pathname === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
