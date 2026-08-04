import Link from "next/link";
import { listSheets } from "@/lib/graph-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sheets = await listSheets();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="label">Local</p>
        <h1
          className="mt-2 text-[clamp(1.9rem,4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Collaboration graphs
        </h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
          Built on this machine after every completed task, whether or not anything was ever
          published. Colour shows where each chunk of work came from — what you asked for, or what
          the agent assumed.
        </p>
      </section>

      {sheets.length === 0 ? (
        <p
          className="rounded-2xl border p-6 text-[13px] leading-relaxed"
          style={{ borderColor: "var(--ink-faint)", color: "var(--ink-dim)" }}
        >
          No graphs yet. One appears here after the first task of a plan completes under
          subagent-driven development. If you expected graphs, check that the container&rsquo;s
          <code> /graphs </code> mount points at your project&rsquo;s
          <code> .governed-superpowers/graphs </code> directory.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sheets.map((sheet) => (
            <li key={sheet.slug}>
              <Link
                href={`/sheet/${sheet.slug}`}
                className="flex flex-col gap-1 rounded-2xl border p-5"
                style={{ borderColor: "var(--ink-faint)" }}
              >
                <span className="text-[15px] font-semibold">{sheet.title}</span>
                <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                  {sheet.specPath}
                </span>
                <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                  {sheet.revisionCount} revision{sheet.revisionCount === 1 ? "" : "s"} · updated{" "}
                  {new Date(sheet.updatedAt).toLocaleString()} ·{" "}
                  {sheet.publish.sentAt ? "published" : "never published"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
