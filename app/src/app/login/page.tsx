import Link from "@/components/NavLink";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getSession } from "@/lib/auth";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const session = await getSession();
  if (session) redirect("/");
  const { created } = await searchParams;

  return (
    <main className="shell">
      <div className="between">
        <span className="label">Exam Practice Studio</span>
        <span className="label">Sign in</span>
      </div>

      <div className="stack-sm">
        <h1 className="title">
          Welcome <span className="accent">Back</span>
        </h1>
        <p className="muted">Sign in to continue your practice sets.</p>
      </div>

      {created ? (
        <div className="dashed">
          <p className="label label-orange">Account created</p>
          <p className="small">The admin has to approve your account before you can practice. You can sign in now to see your status.</p>
        </div>
      ) : null}

      <ActionForm action={signIn} submitLabel="Sign in" buttonClass="btn btn-primary" className="stack">
        <div className="field field-box">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" className="input" placeholder="you@example.com" autoComplete="email" required />
        </div>
        <div className="field field-box">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        </div>
      </ActionForm>

      <details className="small">
        <summary className="label" style={{ cursor: "pointer" }}>
          Forgot password?
        </summary>
        <p className="muted" style={{ marginTop: 8 }}>
          There is no reset email yet. Ask the admin to set a new password for you.
        </p>
      </details>

      <div className="dashed">
        <p className="label label-orange">New here</p>
        <p className="small">
          Create an account with an invite code from any member. The admin approves new accounts before you can start practicing.
        </p>
      </div>

      <div className="between">
        <Link href="/signup" className="btn">
          Create account
        </Link>
        <span className="label">
          Admin? Go to <Link href="/admin">/admin</Link>
        </span>
      </div>

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
