"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ProjectOption } from "./types";

/**
 * Switches which project's sheets are shown. Navigation rather than local
 * state, so the selection is in the URL and a sheet can be linked to directly.
 */
export function ProjectPicker({
  projects,
  selectedProjectId,
}: {
  projects: ProjectOption[];
  selectedProjectId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const selected = projects.find((p) => p.id === selectedProjectId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="label" htmlFor="project">
        Project
      </label>
      <select
        id="project"
        value={selectedProjectId ?? ""}
        disabled={pending || projects.length === 0}
        onChange={(event) => {
          startTransition(() => router.push(`/graphs?project=${event.target.value}`));
        }}
        className="rounded-[var(--radius-panel)] border px-2.5 py-1.5 text-[13px]"
        style={{
          background: "var(--bg-raised)",
          borderColor: "var(--line)",
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      {selected ? (
        <p className="label" style={{ color: "var(--ink-faint)" }}>
          shared {new Date(selected.consentGrantedAt).toLocaleDateString()} ·{" "}
          {selected.scope.length > 0 ? selected.scope.join(", ") : "nothing"}
        </p>
      ) : null}
    </div>
  );
}
