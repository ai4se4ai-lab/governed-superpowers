"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tab-style nav item. The active tab is marked with a solid underline that
 * sits on top of the nav's own hairline border.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="label relative px-3.5 py-3 transition-colors"
      style={{ color: active ? "var(--ink)" : "var(--ink-faint)" }}
    >
      {children}
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-px h-[2px] origin-left transition-transform duration-200"
        style={{
          background: "var(--signal)",
          transform: active ? "scaleX(1)" : "scaleX(0)",
        }}
      />
    </Link>
  );
}
