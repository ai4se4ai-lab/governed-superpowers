"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutGraph } from "@/lib/graph-layout";
import { StateNode } from "./nodes/state-node";
import { SubstateNode } from "./nodes/substate-node";
import type { GraphPayload } from "./types";

// Must be module-level: a fresh object each render makes React Flow rebuild
// every node and warn about it.
const nodeTypes = { stateNode: StateNode, substateNode: SubstateNode };

export function GraphCanvas({
  graph,
  onSelectSubstate,
}: {
  graph: GraphPayload;
  onSelectSubstate: (substateId: string | null) => void;
}) {
  const { nodes, edges } = useMemo(
    () =>
      layoutGraph({
        states: graph.states,
        stateEdges: graph.stateEdges,
        substateEdges: graph.substateEdges,
      }),
    [graph],
  );

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    if (node.type === "substateNode") onSelectSubstate(node.id);
  };

  return (
    <ReactFlow
      className="gsp-flow"
      nodes={nodes as unknown as Node[]}
      edges={edges as unknown as Edge[]}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onSelectSubstate(null)}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.2}
      maxZoom={1.75}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={34} size={1} color="var(--grid)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
