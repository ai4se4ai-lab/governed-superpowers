import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTAINER_PADDING_BOTTOM,
  CONTAINER_PADDING_TOP,
  CONTAINER_PADDING_X,
  CONTAINER_WIDTH,
  SUBSTATE_DIAMETER,
  SUBSTATE_GAP,
  containerHeight,
  layoutGraph,
  type LayoutGraph,
  type LayoutSubstate,
} from "../src/lib/graph-layout.js";

function substate(id: string, over: Partial<LayoutSubstate> = {}): LayoutSubstate {
  return {
    id,
    key: id,
    label: id.toUpperCase(),
    title: `Task ${id}`,
    status: "DONE",
    humanCount: 0,
    aiCount: 0,
    groundedCount: 0,
    ...over,
  };
}

const graph: LayoutGraph = {
  states: [
    {
      id: "state-a",
      key: "a",
      label: "Lay the groundwork",
      summary: null,
      substates: [substate("s1", { aiCount: 3 }), substate("s2", { aiCount: 2 })],
    },
    {
      id: "state-b",
      key: "b",
      label: "Address auth",
      summary: "the connection layer",
      substates: [substate("s3", { humanCount: 4 })],
    },
  ],
  stateEdges: [{ fromId: "state-a", toId: "state-b" }],
  substateEdges: [{ fromId: "s1", toId: "s2" }],
};

test("every container is emitted before the substates it holds", () => {
  // React Flow silently drops children that precede their parent in the array.
  const { nodes } = layoutGraph(graph);

  for (const node of nodes) {
    if (!node.parentId) continue;
    const parentIndex = nodes.findIndex((n) => n.id === node.parentId);
    const ownIndex = nodes.findIndex((n) => n.id === node.id);
    assert.ok(parentIndex >= 0, `parent ${node.parentId} missing`);
    assert.ok(parentIndex < ownIndex, `parent ${node.parentId} must precede ${node.id}`);
  }
});

test("substate positions are relative to their container, not the canvas", () => {
  const { nodes } = layoutGraph(graph);
  const s3 = nodes.find((n) => n.id === "s3")!;
  const stateB = nodes.find((n) => n.id === "state-b")!;

  // state-b sits well to the right, but its only child starts at the padding
  // offset, because React Flow resolves child coordinates against the parent.
  assert.ok(stateB.position.x > 0);
  assert.deepEqual(s3.position, { x: CONTAINER_PADDING_X, y: CONTAINER_PADDING_TOP });
  assert.equal(s3.parentId, "state-b");
  assert.equal(s3.extent, "parent");
});

test("substates stack by diameter plus gap inside a container", () => {
  const { nodes } = layoutGraph(graph);
  const s1 = nodes.find((n) => n.id === "s1")!;
  const s2 = nodes.find((n) => n.id === "s2")!;

  assert.equal(s2.position.y - s1.position.y, SUBSTATE_DIAMETER + SUBSTATE_GAP);
  assert.equal(s1.position.x, s2.position.x);
});

test("container height accounts for every circle and both paddings", () => {
  assert.equal(
    containerHeight(3),
    CONTAINER_PADDING_TOP + 3 * SUBSTATE_DIAMETER + 2 * SUBSTATE_GAP + CONTAINER_PADDING_BOTTOM
  );
  // One circle means no gaps at all.
  assert.equal(
    containerHeight(1),
    CONTAINER_PADDING_TOP + SUBSTATE_DIAMETER + CONTAINER_PADDING_BOTTOM
  );
  // An empty container still needs to render as a box rather than collapse.
  assert.equal(containerHeight(0), CONTAINER_PADDING_TOP + CONTAINER_PADDING_BOTTOM);
});

test("the last circle always fits inside its container", () => {
  const { nodes } = layoutGraph(graph);
  const stateA = nodes.find((n) => n.id === "state-a")!;
  const s2 = nodes.find((n) => n.id === "s2")!;

  assert.equal(stateA.style!.width, CONTAINER_WIDTH);
  assert.ok(
    s2.position.y + SUBSTATE_DIAMETER <= stateA.style!.height,
    "the bottom circle overflows its container"
  );
  assert.ok(s2.position.x + SUBSTATE_DIAMETER <= stateA.style!.width);
});

test("a container's colour comes from the sum of its substates", () => {
  const { nodes } = layoutGraph(graph);

  // state-a holds 5 ai_assumption sources and no human ones.
  assert.equal(nodes.find((n) => n.id === "state-a")!.data.category, "ai");
  assert.deepEqual(nodes.find((n) => n.id === "state-a")!.data.mix, {
    human: 0,
    ai: 5,
    grounded: 0,
  });
  assert.equal(nodes.find((n) => n.id === "state-b")!.data.category, "human");
});

test("a spec published with no annotations sidecar renders as unknown, not balanced", () => {
  const { nodes } = layoutGraph({
    states: [
      { id: "state-x", key: "x", label: "Untagged", summary: null, substates: [substate("s1")] },
    ],
    stateEdges: [],
    substateEdges: [],
  });

  assert.equal(nodes.find((n) => n.id === "state-x")!.data.category, "unknown");
  assert.equal(nodes.find((n) => n.id === "s1")!.data.category, "unknown");
});

test("state edges curve while substate edges run vertically", () => {
  const { edges } = layoutGraph(graph);

  const stateEdge = edges.find((e) => e.source === "state-a")!;
  const substateEdge = edges.find((e) => e.source === "s1")!;

  assert.equal(stateEdge.type, "default");
  assert.equal(substateEdge.type, "smoothstep");
  assert.equal(substateEdge.target, "s2");
});

test("edge ids are unique and stable across repeated layouts", () => {
  const first = layoutGraph(graph);
  const second = layoutGraph(graph);

  assert.deepEqual(
    first.edges.map((e) => e.id),
    second.edges.map((e) => e.id)
  );
  assert.equal(new Set(first.edges.map((e) => e.id)).size, first.edges.length);
});

test("containers are undraggable, substates are the only selectable nodes", () => {
  const { nodes } = layoutGraph(graph);

  for (const node of nodes) {
    assert.equal(node.draggable, false, `${node.id} must not be draggable`);
  }
  assert.equal(nodes.find((n) => n.id === "state-a")!.selectable, false);
  assert.equal(nodes.find((n) => n.id === "s1")!.selectable, true);
});

test("an empty graph lays out to nothing rather than throwing", () => {
  const { nodes, edges } = layoutGraph({ states: [], stateEdges: [], substateEdges: [] });

  assert.deepEqual(nodes, []);
  assert.deepEqual(edges, []);
});
