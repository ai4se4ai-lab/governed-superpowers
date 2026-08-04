import type { LayoutEdge, LayoutState } from "@/lib/graph-layout";

export type PublishRecord = {
  sentAt: string | null;
  skippedReason: string | null;
  omittedFields: string[];
};

export type SheetSummary = {
  slug: string;
  title: string;
  specPath: string;
  planPath: string | null;
  currentRevision: number;
  revisionCount: number;
  updatedAt: string;
  publish: PublishRecord;
};

export type GraphSource = {
  marker: string | null;
  source: string;
  ref: string | null;
  text: string | null;
};

export type SubstateDetail = {
  id: string;
  label: string;
  title: string;
  status: string | null;
  notes: string | null;
  commits: string[];
  changes: { path: string; summary: string }[];
  sources: GraphSource[];
  stateLabel: string;
  humanCount: number;
  aiCount: number;
  groundedCount: number;
};

export type GraphPayload = {
  states: LayoutState[];
  stateEdges: LayoutEdge[];
  substateEdges: LayoutEdge[];
  /** Keyed by substate id - what the drawer renders on click. */
  details: Record<string, SubstateDetail>;
};

export type LoadedRevision = {
  slug: string;
  title: string;
  specPath: string;
  planPath: string | null;
  revision: number;
  revisions: number[];
  builtAt: string;
  trigger: { task: number | null; reason: string } | null;
  annotationCoverage: { mapped: number; total: number } | null;
  publish: PublishRecord;
  graph: GraphPayload;
};

/** A sheet that exists on disk but cannot be rendered, and why. */
export type SheetError = { slug: string; file: string; message: string };
