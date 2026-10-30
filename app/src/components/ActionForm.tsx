"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  buttonClass?: string;
  className?: string;
  // When set, the browser asks before submitting (used for destructive buttons).
  confirmText?: string;
};

// A form wired to a server action. Shows the action's message under the button.
export function ActionForm({ action, children, submitLabel, buttonClass = "btn", className, confirmText }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Working..." : submitLabel}
      </button>
      {state?.message ? (
        <p className="form-msg" data-ok={state.ok} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
