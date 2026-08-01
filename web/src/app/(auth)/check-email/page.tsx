import type { Metadata } from "next";
import Link from "next/link";
import { CheckEmailPanel } from "./check-email-panel";

export const metadata: Metadata = { title: "Check your email · Governed-Superpowers" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;

  return (
    <div className="panel ticked rise p-7 sm:p-8">
      <p className="label">Step 2 of 2</p>
      <h2
        className="mb-3 mt-2 text-[1.7rem] font-bold leading-tight tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Check your inbox
      </h2>

      <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        We sent an invitation link to{" "}
        <span style={{ color: "var(--ink)" }}>{to ?? "your address"}</span>. Click it to activate
        the account — the link is good for 24 hours.
      </p>

      <div className="rule my-6" />

      <CheckEmailPanel email={to ?? ""} />

      <p className="mt-6 text-[13px]" style={{ color: "var(--ink-dim)" }}>
        Already confirmed?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
