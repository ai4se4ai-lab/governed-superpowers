"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({ confirmed }: { confirmed: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, {});
  const errors = state.errors ?? {};

  return (
    <div className="panel ticked rise p-7 sm:p-8">
      <p className="label">Existing account</p>
      <h2
        className="mb-1 mt-2 text-[1.7rem] font-bold leading-tight tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Sign in
      </h2>
      <p className="mb-7 text-[13px]" style={{ color: "var(--ink-dim)" }}>
        Manage your profile and your MCP tokens.
      </p>

      {confirmed ? (
        <p
          className="mb-6 flex items-start gap-2.5 border-l-2 px-3 py-2 text-[12px] leading-relaxed"
          style={{ borderColor: "var(--live)", background: "var(--signal-wash)" }}
          role="status"
        >
          <span
            aria-hidden
            className="dot-live mt-[5px] h-[6px] w-[6px] shrink-0"
            style={{ background: "var(--live)" }}
          />
          Address confirmed. Sign in to continue.
        </p>
      ) : null}

      <form action={formAction} className="stagger flex flex-col gap-5" noValidate>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          required
          error={errors.password}
        />

        {errors._form ? (
          <p
            className="border-l-2 px-3 py-2 text-[12px] leading-relaxed"
            style={{ borderColor: "var(--alarm)", background: "var(--alarm-wash)", color: "var(--alarm)" }}
            role="alert"
          >
            {errors._form}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Signing in">Sign in</SubmitButton>
      </form>

      <div className="rule my-6" />

      <p className="text-[13px]" style={{ color: "var(--ink-dim)" }}>
        No account yet?{" "}
        <Link href="/signup" className="link">
          Create one
        </Link>
      </p>
    </div>
  );
}
