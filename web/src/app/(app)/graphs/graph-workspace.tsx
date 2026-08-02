"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ProjectPicker } from "./project-picker";
import { SheetTabs } from "./sheet-tabs";
import { SubstateDrawer } from "./substate-drawer";
import type { GraphPayload, ProjectOption, SheetOption } from "./types";

// React Flow measures the DOM on mount, so it cannot be server-rendered.
const GraphCanvas = dynamic(() => import("./graph-canvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <CanvasMessage>Loading canvas…</CanvasMessage>,
});

export function GraphWorkspace({
  projects,
  selectedProjectId,
  sheets,
  selectedSheetId,
  graph,
}: {
  projects: ProjectOption[];
  selectedProjectId: string | null;
  sheets: SheetOption[];
  selectedSheetId: string | null;
  graph: GraphPayload | null;
}) {
  const [openSubstateId, setOpenSubstateId] = useState<string | null>(null);

  if (projects.length === 0) return <NoProjects />;

  const openSubstate = openSubstateId ? (graph?.details[openSubstateId] ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      <ProjectPicker projects={projects} selectedProjectId={selectedProjectId} />

      <div className="relative">
        <div
          className="panel ticked h-[min(66vh,640px)] overflow-hidden"
          style={{ background: "var(--bg-raised)" }}
        >
          {!graph || graph.states.length === 0 ? (
            <CanvasMessage>
              {sheets.length === 0
                ? "No specs published for this project yet."
                : "This sheet has no states yet."}
            </CanvasMessage>
          ) : (
            <GraphCanvas graph={graph} onSelectSubstate={setOpenSubstateId} />
          )}
        </div>

        <SubstateDrawer detail={openSubstate} onClose={() => setOpenSubstateId(null)} />
      </div>

      <SheetTabs sheets={sheets} selectedSheetId={selectedSheetId} projectId={selectedProjectId} />
    </div>
  );
}

function CanvasMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="text-[13px]" style={{ color: "var(--ink-faint)" }}>
        {children}
      </p>
    </div>
  );
}

function NoProjects() {
  return (
    <div className="panel ticked flex flex-col gap-3 p-8">
      <p className="label">Nothing published yet</p>
      <p className="max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        Graphs arrive here from your own projects. When an agent finishes a plan with{" "}
        <code style={{ color: "var(--ink)" }}>subagent-driven-development</code>, it will ask whether
        to share that spec&rsquo;s graph. Nothing is sent until you say yes, and you can revoke it at
        any time — from here, or by asking the agent to run{" "}
        <code style={{ color: "var(--ink)" }}>revoke_published_graph</code>.
      </p>
    </div>
  );
}
