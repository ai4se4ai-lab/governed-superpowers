"use client";

import { useId } from "react";

type FieldProps = {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "id">;

/**
 * Label + input + inline error, wired together with a generated id so screen
 * readers announce the message with the field. `children` replaces the input
 * entirely for selects and textareas.
 */
export function Field({ label, name, error, hint, children, ...inputProps }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children ?? (
        <input
          {...inputProps}
          id={id}
          name={name}
          className="input"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="text-[12px]" style={{ color: "var(--alarm)" }}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px]" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
