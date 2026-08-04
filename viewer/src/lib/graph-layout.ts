import { categorise, mixOf, type ColorCategory, type Mix } from "./graph-color";

/**
 * Turns a published graph into positioned React Flow nodes and edges.
 *
 * Positions are computed here rather than stored: the publish payload carries
 * no geometry, the structure is a strictly two-level ordered tree, and nodes
 * render undraggable - so there is no user-arranged state that a layout pass
 * could destroy. If manual arrangement is ever wanted, adding x/y columns is
 * an additive schema change.
 *
 * Deliberately free of any @xyflow/react import so it stays unit-testable
 * without a DOM; the canvas component casts these into React Flow's types.
 */

export const SUBSTATE_DIAMETER = 72;
export const SUBSTATE_GAP = 56;
export const CONTAINER_PADDING_X = 36;
/** Room above the first circle for the container's label and mix caption. */
export const CONTAINER_PADDING_TOP = 56;
export const CONTAINER_PADDING_BOTTOM = 36;
export const CONTAINER_WIDTH = SUBSTATE_DIAMETER + CONTAINER_PADDING_X * 2;
export const CONTAINER_GUTTER = 140;
/** Each container sits lower than the last, so state edges read as curves. */
export const CONTAINER_STAGGER = 120;

export type LayoutSubstate = {
  id: string;
  key: string;
  label: string;
  title: string;
  status: string | null;
  humanCount: number;
  aiCount: number;
  groundedCount: number;
};

export type LayoutState = {
  id: string;
  key: string;
  label: string;
  summary: string | null;
  substates: LayoutSubstate[];
};

export type LayoutEdge = { fromId: string; toId: string };

export type LayoutGraph = {
  states: LayoutState[];
  stateEdges: LayoutEdge[];
  substateEdges: LayoutEdge[];
};

export type StateNodeData = {
  kind: "state";
  label: string;
  summary: string | null;
  category: ColorCategory;
  mix: Mix;
};

export type SubstateNodeData = {
  kind: "substate";
  label: string;
  title: string;
  status: string | null;
  category: ColorCategory;
  mix: Mix;
};

export type FlowNode = {
  id: string;
  type: "stateNode" | "substateNode";
  position: { x: number; y: number };
  data: StateNodeData | SubstateNodeData;
  parentId?: string;
  extent?: "parent";
  draggable: false;
  selectable: boolean;
  style?: { width: number; height: number };
  zIndex?: number;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  type: "smoothstep" | "default";
  markerEnd: { type: "arrowclosed" };
};

export function containerHeight(substateCount: number): number {
  if (substateCount === 0) return CONTAINER_PADDING_TOP + CONTAINER_PADDING_BOTTOM;
  return (
    CONTAINER_PADDING_TOP +
    substateCount * SUBSTATE_DIAMETER +
    (substateCount - 1) * SUBSTATE_GAP +
    CONTAINER_PADDING_BOTTOM
  );
}

export function layoutGraph(graph: LayoutGraph): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];

  graph.states.forEach((state, index) => {
    const mix = mixOf(state.substates);
    const category = categorise(mix);

    // React Flow requires a parent node to appear BEFORE its children in the
    // array, or the children are dropped without a warning.
    nodes.push({
      id: state.id,
      type: "stateNode",
      position: { x: index * (CONTAINER_WIDTH + CONTAINER_GUTTER), y: index * CONTAINER_STAGGER },
      data: { kind: "state", label: state.label, summary: state.summary, category, mix },
      draggable: false,
      selectable: false,
      style: { width: CONTAINER_WIDTH, height: containerHeight(state.substates.length) },
      zIndex: 0,
    });

    state.substates.forEach((substate, i) => {
      const substateMix = mixOf([substate]);
      nodes.push({
        id: substate.id,
        type: "substateNode",
        // Child positions are relative to the parent container, not the canvas.
        position: {
          x: CONTAINER_PADDING_X,
          y: CONTAINER_PADDING_TOP + i * (SUBSTATE_DIAMETER + SUBSTATE_GAP),
        },
        data: {
          kind: "substate",
          label: substate.label,
          title: substate.title,
          status: substate.status,
          category: categorise(substateMix),
          mix: substateMix,
        },
        parentId: state.id,
        extent: "parent",
        draggable: false,
        selectable: true,
        zIndex: 1,
      });
    });
  });

  const edges: FlowEdge[] = [
    ...graph.stateEdges.map((edge) => ({
      id: `state-${edge.fromId}-${edge.toId}`,
      source: edge.fromId,
      target: edge.toId,
      type: "default" as const,
      markerEnd: { type: "arrowclosed" as const },
    })),
    ...graph.substateEdges.map((edge) => ({
      id: `substate-${edge.fromId}-${edge.toId}`,
      source: edge.fromId,
      target: edge.toId,
      type: "smoothstep" as const,
      markerEnd: { type: "arrowclosed" as const },
    })),
  ];

  return { nodes, edges };
}
