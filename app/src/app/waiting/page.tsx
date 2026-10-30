import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signOut } from "@/app/actions";

export default async function WaitingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile } = session;
  if (profile?.status === "active") redirect("/");

  const disabled = profile?.status === "disabled";
  const missing = !profile;

  return (
    <main className="shell">
      <div className="between">
        <span className="label">Exam Practice Studio</span>
        <span className="label">{disabled ? "Disabled" : "Pending"}</span>
      </div>

      <div className="stack-sm">
        <h1 className="title">
          {disabled ? (
            <>
              Account <span className="accent">Off</span>
            </>
          ) : missing ? (
            <>
              No <span className="accent">Profile</span>
            </>
          ) : (
            <>
              Almost <span className="accent">There</span>
            </>
          )}
        </h1>
        <p className="muted">
          {disabled
            ? "The admin has switched this account off. Ask the admin if you think this is a mistake."
            : missing
              ? "This sign-in has no practice profile. Accounts are created with an invite code."
              : `Hi ${profile.name}. Your account is waiting for the admin to approve it.`}
        </p>
      </div>

      {!disabled && !missing ? (
        <div className="dashed">
          <p className="label label-orange">What happens next</p>
          <p className="small">The admin sees who invited you and approves new accounts by hand. Come back and sign in again once you have been told you are in.</p>
        </div>
      ) : null}

      <form action={signOut}>
        <button type="submit" className="btn">
          Sign out
        </button>
      </form>

      <p className="label footer">Exam Practice Studio</p>
    </main>
  );
}
