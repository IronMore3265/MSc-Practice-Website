"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignupForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          code: form.get("code"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the account. Try again.");
        setPending(false);
        return;
      }
      router.push("/login?created=1");
    } catch {
      setError("Network problem. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="field field-box">
        <label className="label" htmlFor="code">
          Invite code
        </label>
        <input id="code" name="code" className="input" defaultValue={initialCode} placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" />
      </div>
      <div className="field field-box">
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" maxLength={80} autoComplete="name" required />
      </div>
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
        <input id="password" name="password" type="password" className="input" minLength={8} maxLength={72} autoComplete="new-password" required />
        <span className="small muted">At least 8 characters.</span>
      </div>
      <div className="between">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating..." : "Create account"}
        </button>
      </div>
      {error ? (
        <p className="form-msg" data-ok="false" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
