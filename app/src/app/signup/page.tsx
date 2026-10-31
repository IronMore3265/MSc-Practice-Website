import Link from "@/components/NavLink";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SignupForm } from "./SignupForm";
import { BrandTitle } from "@/components/BrandTitle";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await getSession();
  if (session) redirect("/");
  const { code } = await searchParams;

  return (
    <main className="shell">
      <div className="between">
        <BrandTitle />
        <span className="label">Create account</span>
      </div>

      <div className="stack-sm">
        <h1 className="title">
          Join the <span className="accent">Studio</span>
        </h1>
        <p className="muted">You need an invite code from a member. The admin approves your account before you can practice.</p>
      </div>

      <SignupForm initialCode={(code ?? "").slice(0, 20)} />

      <div className="between">
        <Link href="/login" className="btn btn-small">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
