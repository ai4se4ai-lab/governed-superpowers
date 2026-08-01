import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { destroyAllSessions } from "@/lib/auth";
import { consumeVerification } from "@/lib/verification";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata: Metadata = { title: "Confirming · Governed-Superpowers" };

// The token is single-use and mutates state, so this must never be cached or
// prerendered.
export const dynamic = "force-dynamic";

type Outcome = { ok: true; heading: string; body: string } | { ok: false; heading: string; body: string };

async function confirm(token: string): Promise<Outcome> {
  const result = await consumeVerification(token);

  if (!result.ok) {
    const body =
      result.reason === "expired"
        ? "That link has expired. Sign in to request a fresh one, or sign up again."
        : result.reason === "used"
          ? "That link has already been used. If you've confirmed the address, just sign in."
          : "We don't recognise that link. Check you copied the whole URL from the email.";
    return { ok: false, heading: "Link not usable", body };
  }

  if (result.purpose === "EMAIL_CONFIRM") {
    await prisma.user.update({
      where: { id: result.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return {
      ok: true,
      heading: "Account confirmed",
      body: "Your address is verified. Sign in to mint your first MCP token.",
    };
  }

  if (result.purpose === "EMAIL_CHANGE" && result.newEmail) {
    try {
      await prisma.user.update({
        where: { id: result.userId },
        data: { email: result.newEmail, emailVerifiedAt: new Date() },
      });
    } catch (error) {
      // Someone else claimed the address between the request and the click.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return {
          ok: false,
          heading: "Address unavailable",
          body: "That address was taken by another account before you confirmed. Your old address is unchanged.",
        };
      }
      throw error;
    }
    // Changing the login identity invalidates every existing session.
    await destroyAllSessions(result.userId);
    return {
      ok: true,
      heading: "Address updated",
      body: `Sign in again with ${result.newEmail}. Your MCP tokens were not affected.`,
    };
  }

  return { ok: false, heading: "Link not usable", body: "That link can't be applied." };
}

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const outcome = await confirm(token);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="label" style={{ color: "var(--ink)" }}>
          ▚ Governed-Superpowers
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center pb-20">
        <div className="panel ticked rise w-full max-w-md p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <span
              aria-hidden
              className={outcome.ok ? "dot-live h-[7px] w-[7px]" : "h-[7px] w-[7px]"}
              style={{ background: outcome.ok ? "var(--live)" : "var(--alarm)" }}
            />
            <p className="label">{outcome.ok ? "Verified" : "Rejected"}</p>
          </div>

          <h1
            className="mb-3 text-[1.7rem] font-bold leading-tight tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {outcome.heading}
          </h1>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
            {outcome.body}
          </p>

          <div className="rule my-7" />

          <div className="flex flex-wrap gap-3">
            <Link href={outcome.ok ? "/login?confirmed=1" : "/login"} className="btn btn-primary">
              Go to sign in
            </Link>
            {outcome.ok ? null : (
              <Link href="/signup" className="btn btn-ghost">
                Sign up
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
