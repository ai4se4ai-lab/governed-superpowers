import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Overview · Governed-Superpowers" };
export const dynamic = "force-dynamic";

function relative(date: Date | null): string {
  if (!date) return "never";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function DashboardPage() {
  const user = await requireUser();

  const [active, revoked, lastUsed] = await Promise.all([
    prisma.mcpToken.count({ where: { userId: user.id, revokedAt: null } }),
    prisma.mcpToken.count({ where: { userId: user.id, revokedAt: { not: null } } }),
    prisma.mcpToken.findFirst({
      where: { userId: user.id, lastUsedAt: { not: null } },
      orderBy: { lastUsedAt: "desc" },
      select: { lastUsedAt: true, name: true },
    }),
  ]);

  const stats: Array<[string, string, string]> = [
    ["Active tokens", String(active), "usable against /mcp right now"],
    ["Revoked", String(revoked), "refused on the next request"],
    ["Last used", relative(lastUsed?.lastUsedAt ?? null), lastUsed?.name ?? "no token has connected yet"],
  ];

  return (
    <div className="stagger flex flex-col gap-9">
      <section>
        <p className="label">Overview</p>
        <h1
          className="mt-2 text-[clamp(1.9rem,4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Welcome back, {user.username}.
        </h1>
      </section>

      <section className="grid gap-px sm:grid-cols-3" style={{ background: "var(--line)" }}>
        {stats.map(([label, value, note]) => (
          <div key={label} className="flex flex-col gap-2 p-5" style={{ background: "var(--bg-raised)" }}>
            <p className="label">{label}</p>
            <p
              className="text-[2rem] font-bold leading-none tracking-[-0.03em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {value}
            </p>
            <p className="text-[12px]" style={{ color: "var(--ink-faint)" }}>
              {note}
            </p>
          </div>
        ))}
      </section>

      <section className="panel ticked p-6">
        <p className="label">Connect a client</p>
        <h2 className="mb-4 mt-2 text-lg font-semibold tracking-[-0.01em]">
          Point any MCP client at this server
        </h2>
        <pre
          className="overflow-x-auto border p-4 text-[12.5px] leading-relaxed"
          style={{ background: "var(--bg-sunken)", borderColor: "var(--line)" }}
        >
{`claude mcp add --transport http governed-superpowers \\
  https://<your-domain>/mcp \\
  --header "Authorization: Bearer <your-token>"`}
        </pre>
        <p className="mt-4 text-[13px]" style={{ color: "var(--ink-dim)" }}>
          Need a token?{" "}
          <Link href="/tokens" className="link">
            Mint one
          </Link>
          . Full client setup for VS Code, Cursor and Claude Code lives in{" "}
          <code style={{ color: "var(--ink)" }}>mcp-server/docs/using-mcp-server.md</code>.
        </p>
      </section>
    </div>
  );
}
