"use client";

import { useState } from "react";

/**
 * Copies `value` to the clipboard with a short confirmation state.
 * navigator.clipboard is unavailable on insecure origins other than
 * localhost, so failures surface rather than silently doing nothing.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "btn btn-ghost",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
