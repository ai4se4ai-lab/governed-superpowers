import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TokenConsole, type TokenRow } from "./token-console";

export const metadata: Metadata = { title: "Tokens · Governed-Superpowers" };
export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const user = await requireUser();

  const tokens = await prisma.mcpToken.findMany({
    where: { userId: user.id },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    // The hash never leaves the database.
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  const rows: TokenRow[] = tokens.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
  }));

  return (
    <div className="stagger flex flex-col gap-8">
      <section>
        <p className="label">Credentials</p>
        <h1
          className="mt-2 text-[clamp(1.9rem,4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          MCP tokens
        </h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
          Each token authenticates one client against{" "}
          <code style={{ color: "var(--ink)" }}>/mcp</code>. The full value is shown once, at
          creation — after that only the prefix is stored in readable form. Revoking takes effect on
          the very next request.
        </p>
      </section>

      <TokenConsole initialTokens={rows} />
    </div>
  );
}
