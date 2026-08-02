import type { LayoutEdge, LayoutState } from "@/lib/graph-layout";

export type ProjectOption = {
  id: string;
  slug: string;
  name: string;
  consentGrantedAt: string;
  /** Human-readable names of the fields the user agreed to share. */
  scope: string[];
};

export type SheetOption = {
  id: string;
  title: string;
  specPath: string;
  lastPublishedAt: string;
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
