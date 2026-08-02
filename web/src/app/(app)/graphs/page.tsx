import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { GraphWorkspace } from "./graph-workspace";
import type { GraphPayload, ProjectOption, SheetOption, SubstateDetail } from "./types";

export const metadata: Metadata = { title: "Graphs · Governed-Superpowers" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ project?: string; spec?: string }>;

export default async function GraphsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { project: projectParam, spec: specParam } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      consentScope: true,
      consentGrantedAt: true,
      specs: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, specPath: true, lastPublishedAt: true },
      },
    },
  });

  // An unknown ?project= falls back to the first project rather than 404ing -
  // the id may simply have been deleted in another tab.
  const selectedProject = projects.find((p) => p.id === projectParam) ?? projects[0] ?? null;
  const selectedSpec =
    selectedProject?.specs.find((s) => s.id === specParam) ?? selectedProject?.specs[0] ?? null;

  const graph = selectedSpec ? await loadGraph(selectedSpec.id) : null;

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    consentGrantedAt: p.consentGrantedAt.toISOString(),
    scope: scopeLabels(p.consentScope),
  }));

  const sheets: SheetOption[] = (selectedProject?.specs ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    specPath: s.specPath,
    lastPublishedAt: s.lastPublishedAt.toISOString(),
  }));

  return (
    <div className="stagger flex flex-col gap-8">
      <section>
        <p className="label">Collaboration</p>
        <h1
          className="mt-2 text-[clamp(1.9rem,4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Graphs
        </h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
          One sheet per spec, published from your projects over MCP. Each container groups the work
          done for one part of the spec; the circles inside it are the individual tasks. Colour shows
          where that work came from — what you asked for, or what the agent assumed.
        </p>
      </section>

      <GraphWorkspace
        projects={projectOptions}
        selectedProjectId={selectedProject?.id ?? null}
        sheets={sheets}
        selectedSheetId={selectedSpec?.id ?? null}
        graph={graph}
      />
    </div>
  );
}

/** The consent scope column also carries originHash/grantedBy; those aren't scope flags. */
function scopeLabels(consentScope: unknown): string[] {
  if (!consentScope || typeof consentScope !== "object") return [];
  const known: Record<string, string> = {
    specPaths: "spec paths",
    substateTitles: "task titles",
    changePaths: "changed files",
    annotationText: "requirement text",
  };
  return Object.entries(consentScope as Record<string, unknown>)
    .filter(([key, on]) => on === true && key in known)
    .map(([key]) => known[key]);
}

async function loadGraph(specId: string): Promise<GraphPayload> {
  const [states, stateEdges, substateEdges] = await Promise.all([
    prisma.graphState.findMany({
      where: { specId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        key: true,
        label: true,
        summary: true,
        substates: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            key: true,
            label: true,
            title: true,
            status: true,
            notes: true,
            commits: true,
            changes: true,
            humanCount: true,
            aiCount: true,
            groundedCount: true,
            sources: { select: { marker: true, source: true, ref: true, text: true } },
          },
        },
      },
    }),
    prisma.graphStateEdge.findMany({ where: { specId }, select: { fromId: true, toId: true } }),
    prisma.graphSubstateEdge.findMany({ where: { specId }, select: { fromId: true, toId: true } }),
  ]);

  const details: Record<string, SubstateDetail> = {};
  for (const state of states) {
    for (const substate of state.substates) {
      details[substate.id] = {
        id: substate.id,
        label: substate.label,
        title: substate.title,
        status: substate.status,
        notes: substate.notes,
        commits: substate.commits,
        changes: Array.isArray(substate.changes)
          ? (substate.changes as { path: string; summary: string }[])
          : [],
        sources: substate.sources,
        stateLabel: state.label,
        humanCount: substate.humanCount,
        aiCount: substate.aiCount,
        groundedCount: substate.groundedCount,
      };
    }
  }

  return {
    states: states.map((state) => ({
      id: state.id,
      key: state.key,
      label: state.label,
      summary: state.summary,
      substates: state.substates.map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
        title: s.title,
        status: s.status,
        humanCount: s.humanCount,
        aiCount: s.aiCount,
        groundedCount: s.groundedCount,
      })),
    })),
    stateEdges,
    substateEdges,
    details,
  };
}
