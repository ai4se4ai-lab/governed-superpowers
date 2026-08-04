"use client";

import { useEffect } from "react";
import { categorise, mixCaption, themeFor } from "@/lib/graph-color";
import type { GraphSource, SubstateDetail } from "./types";

/** How each provenance source type reads in plain English. */
const SOURCE_LABELS: Record<string, string> = {
  human: "You said it",
  ai_assumption: "The agent assumed it",
  skill_doc: "Grounded in a skill or project doc",
  tool_output: "Grounded in tool output",
  existing_codebase: "Grounded in existing code",
  external_reference: "Grounded in an external reference",
};

const SOURCE_ORDER = [
  "human",
  "ai_assumption",
  "skill_doc",
  "tool_output",
  "existing_codebase",
  "external_reference",
];

export function SubstateDrawer({
  detail,
  onClose,
}: {
  detail: SubstateDetail | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!detail) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, onClose]);

  if (!detail) return null;

  const mix = { human: detail.humanCount, ai: detail.aiCount, grounded: detail.groundedCount };
  const theme = themeFor(categorise(mix));
  const grouped = groupSources(detail.sources);

  return (
    <aside
      aria-label={`Details for ${detail.title}`}
      className="panel absolute inset-y-0 right-0 z-10 flex w-[min(26rem,92%)] flex-col overflow-y-auto p-5 shadow-lg"
      style={{ background: "var(--bg-raised)", borderColor: "var(--line)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label" style={{ color: "var(--ink-faint)" }}>
            {detail.stateLabel} · {detail.label}
          </p>
          <h2
            className="mt-1 text-[16px] font-bold leading-snug"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {detail.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="label shrink-0"
          style={{ color: "var(--ink-faint)", cursor: "pointer" }}
        >
          close
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {detail.status ? (
          <Badge tone={detail.status === "BLOCKED" ? "var(--alarm)" : "var(--live)"}>
            {detail.status.replace(/_/g, " ").toLowerCase()}
          </Badge>
        ) : null}
        <Badge tone={theme.stroke}>{theme.label}</Badge>
        <span className="label" style={{ color: "var(--ink-faint)" }}>
          {mixCaption(mix)}
        </span>
      </div>

      <Section title="Where this came from">
        {detail.sources.length === 0 ? (
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
            No provenance recorded. This spec was published without an annotations sidecar, so
            there is nothing to say about which parts you drove and which the agent assumed.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(([source, entries]) => (
              <div key={source}>
                <p className="label" style={{ color: "var(--ink-dim)" }}>
                  {SOURCE_LABELS[source] ?? source} · {entries.length}
                </p>
                <ul className="mt-1 flex flex-col gap-2">
                  {entries.map((entry, i) => (
                    <li key={`${source}-${i}`} className="text-[13px] leading-relaxed">
                      {/* The verbatim requirement, so a bad annotation-to-task
                          match is visible rather than hidden behind a colour. */}
                      {entry.text ? (
                        <span style={{ color: "var(--ink)" }}>&ldquo;{entry.text}&rdquo;</span>
                      ) : (
                        <span style={{ color: "var(--ink-faint)" }}>(text not shared)</span>
                      )}
                      {entry.ref ? (
                        <code
                          className="ml-1 break-all text-[11px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {entry.ref}
                        </code>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {detail.changes.length > 0 ? (
        <Section title="What changed">
          <ul className="flex flex-col gap-2">
            {detail.changes.map((change, i) => (
              <li key={`${change.path}-${i}`} className="text-[13px] leading-relaxed">
                <code className="break-all" style={{ color: "var(--ink)" }}>
                  {change.path}
                </code>
                <span className="ml-1" style={{ color: "var(--ink-dim)" }}>
                  — {change.summary}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.notes ? (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
            {detail.notes}
          </p>
        </Section>
      ) : null}

      {detail.commits.length > 0 ? (
        <Section title="Commits">
          <ul className="flex flex-wrap gap-2">
            {detail.commits.map((commit) => (
              <li key={commit}>
                <code className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                  {commit.slice(0, 10)}
                </code>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
      <p className="label mb-2">{title}</p>
      {children}
    </section>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className="label rounded-[var(--radius-panel)] border px-1.5 py-0.5"
      style={{ borderColor: tone, color: tone }}
    >
      {children}
    </span>
  );
}

function groupSources(sources: GraphSource[]): [string, GraphSource[]][] {
  const byType = new Map<string, GraphSource[]>();
  for (const source of sources) {
    const list = byType.get(source.source) ?? [];
    list.push(source);
    byType.set(source.source, list);
  }
  return [...byType.entries()].sort(
    ([a], [b]) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b),
  );
}
