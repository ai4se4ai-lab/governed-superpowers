import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Split shell for the signed-out routes: an editorial left column that states
 * what the service is, and the form itself on the right. On narrow screens the
 * left column collapses to a single header line.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="label" style={{ color: "var(--ink)" }}>
          ▚ Governed-Superpowers
        </Link>
        <ThemeToggle />
      </header>

      <main className="grid flex-1 items-center gap-12 pb-16 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-20">
        <section className="hidden lg:block">
          <p className="label mb-5">MCP access console</p>
          <h1
            className="text-balance text-[clamp(2.4rem,4.4vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Issue your own
            <br />
            <span style={{ color: "var(--signal)" }}>MCP tokens.</span>
            <br />
            Revoke them
            <br />
            the moment you
            <br />
            need to.
          </h1>

          <div className="rule my-8 max-w-md" />

          <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[13px]">
            {[
              ["01", "Sign up and confirm your address by email."],
              ["02", "Mint a token per machine, with an optional expiry."],
              ["03", "Point any MCP client at /mcp with that token."],
              ["04", "Revoke it here — the next request is refused."],
            ].map(([n, text]) => (
              <div key={n} className="contents">
                <dt className="label pt-[3px]">{n}</dt>
                <dd style={{ color: "var(--ink-dim)" }}>{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="w-full">{children}</section>
      </main>
    </div>
  );
}
