import Link from "next/link";
import { AdminTabs } from "@/components/AdminTabs";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <main className="shell shell-wide">
      <div className="between">
        <span className="label">Admin</span>
        <div className="wrap">
          <span className="label">Master portal</span>
          <Link href="/" className="btn btn-small">
            Back to site
          </Link>
        </div>
      </div>
      <AdminTabs />
      {children}
      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
