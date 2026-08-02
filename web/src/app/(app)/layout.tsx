import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <Link href="/dashboard" className="label" style={{ color: "var(--ink)" }}>
          ▚ Governed-Superpowers
        </Link>
        <div className="flex items-center gap-5">
          <ThemeToggle />
          <span className="label hidden sm:inline" title={user.email}>
            {user.username}
          </span>
          <form action={logoutAction}>
            <button type="submit" className="label" style={{ cursor: "pointer" }}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      <nav className="flex gap-1 border-b pb-0" style={{ borderColor: "var(--line)" }}>
        <NavLink href="/dashboard">Overview</NavLink>
        <NavLink href="/tokens">Tokens</NavLink>
        <NavLink href="/graphs">Graphs</NavLink>
        <NavLink href="/profile">Profile</NavLink>
      </nav>

      <main className="flex-1 py-9">{children}</main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t py-5" style={{ borderColor: "var(--line)" }}>
        <p className="label">MCP endpoint · /mcp</p>
        <p className="label">Signed in as {user.email}</p>
      </footer>
    </div>
  );
}
