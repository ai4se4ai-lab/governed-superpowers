"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signupAction, type FormState } from "@/app/actions/auth";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { passwordStrength, signupSchema } from "@/lib/validation";

const STRENGTH_LABEL = ["", "weak", "fair", "good", "strong"] as const;

export function SignupForm() {
  const [state, formAction] = useActionState<FormState, FormData>(signupAction, {});
  const [password, setPassword] = useState("");
  // Client-side mirrors of the server errors, so mistakes surface on blur
  // instead of after a round trip. The server still re-validates everything.
  const [local, setLocal] = useState<Record<string, string>>({});

  const errors = { ...state.errors, ...local };
  const strength = passwordStrength(password);

  function validateOnBlur(field: "username" | "email" | "password", value: string) {
    const result = signupSchema.shape[field].safeParse(value);
    setLocal((prev) => {
      const next = { ...prev };
      if (result.success || value.length === 0) delete next[field];
      else next[field] = result.error.issues[0].message;
      return next;
    });
  }

  return (
    <div className="panel ticked rise p-7 sm:p-8">
      <p className="label">New account</p>
      <h2
        className="mb-1 mt-2 text-[1.7rem] font-bold leading-tight tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Request access
      </h2>
      <p className="mb-7 text-[13px]" style={{ color: "var(--ink-dim)" }}>
        We&apos;ll email you an invitation link to confirm the address.
      </p>

      <form action={formAction} className="stagger flex flex-col gap-5" noValidate>
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          placeholder="ada-lovelace"
          required
          error={errors.username}
          onBlur={(e) => validateOnBlur("username", e.target.value)}
        />

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          error={errors.email}
          onBlur={(e) => validateOnBlur("email", e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="at least 12 characters"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={(e) => validateOnBlur("password", e.target.value)}
            error={errors.password}
          />
          <div className="flex items-center gap-2" aria-hidden>
            <div className="flex flex-1 gap-1">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className="h-[3px] flex-1 origin-left transition-colors duration-300"
                  style={{
                    background: strength >= step ? "var(--signal)" : "var(--line)",
                  }}
                />
              ))}
            </div>
            <span className="label w-12 text-right">{STRENGTH_LABEL[strength]}</span>
          </div>
        </div>

        {errors._form ? (
          <p
            className="border-l-2 px-3 py-2 text-[12px] leading-relaxed"
            style={{ borderColor: "var(--alarm)", background: "var(--alarm-wash)", color: "var(--alarm)" }}
            role="alert"
          >
            {errors._form}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Creating">Create account</SubmitButton>
      </form>

      <div className="rule my-6" />

      <p className="text-[13px]" style={{ color: "var(--ink-dim)" }}>
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
