import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listSheets, loadRevision } from "../src/lib/graph-store";

function revisionDoc(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    revision: 2,
    builtAt: "2026-08-03T10:00:00Z",
    trigger: { task: 2, reason: "task-complete" },
    spec: { path: "docs/specs/a-design.md", title: "A design", planPath: "docs/plans/a.md" },
    states: [
      {
        key: "s1",
        label: "First chunk",
        summary: "Some prose",
        substates: [
          {
            key: "task-1",
            title: "Do the thing",
            status: "DONE",
            changes: [{ path: "a.ts", summary: "new file" }],
            commits: ["abc1234"],
            notes: "Local only.",
            sources: [{ marker: "1", source: "human", ref: null, text: "Must do it." }],
            humanCount: 1,
            aiCount: 0,
            groundedCount: 0,
          },
        ],
      },
    ],
    stateEdges: [],
    substateEdges: [],
    annotationCoverage: { mapped: 1, total: 2 },
    publish: { sentAt: null, skippedReason: "no-consent", omittedFields: [] },
    ...overrides,
  };
}

/** Builds a store on disk and points GRAPH_DIR at it. */
function setupStore(revisions: Record<string, unknown>[] = [revisionDoc()]) {
  const dir = mkdtempSync(join(tmpdir(), "viewer-store-"));
  const sheet = join(dir, "a-design");
  mkdirSync(join(sheet, "revisions"), { recursive: true });

  revisions.forEach((doc, i) => {
    writeFileSync(
      join(sheet, "revisions", `${String(i + 1).padStart(4, "0")}.json`),
      JSON.stringify(doc)
    );
  });
  writeFileSync(join(sheet, "current.json"), JSON.stringify(revisions[revisions.length - 1]));
  writeFileSync(
    join(dir, "index.json"),
    JSON.stringify({
      formatVersion: 1,
      sheets: [
        {
          slug: "a-design",
          specPath: "docs/specs/a-design.md",
          title: "A design",
          planPath: "docs/plans/a.md",
          currentRevision: revisions.length,
          revisionCount: revisions.length,
          updatedAt: "2026-08-03T10:00:00Z",
          publish: { sentAt: null, skippedReason: "no-consent", omittedFields: [] },
        },
      ],
    })
  );

  process.env.GRAPH_DIR = dir;
  return dir;
}

test("listSheets returns an empty list when GRAPH_DIR does not exist", async () => {
  process.env.GRAPH_DIR = join(tmpdir(), "definitely-not-here-9e3f");
  assert.deepEqual(await listSheets(), []);
});

test("listSheets reads the index without opening revisions", async () => {
  setupStore();
  const sheets = await listSheets();
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].slug, "a-design");
  assert.equal(sheets[0].publish.skippedReason, "no-consent");
});

test("loadRevision maps a document into a GraphPayload with synthesised ids", async () => {
  setupStore();
  const loaded = await loadRevision("a-design");
  assert.ok(loaded && !("message" in loaded));

  const state = loaded.graph.states[0];
  assert.equal(state.id, "state-s1");
  assert.equal(state.substates[0].id, "sub-s1-task-1");
  assert.equal(state.substates[0].humanCount, 1);

  const detail = loaded.graph.details["sub-s1-task-1"];
  assert.equal(detail.title, "Do the thing");
  assert.equal(detail.stateLabel, "First chunk");
  assert.equal(detail.notes, "Local only.");
  assert.deepEqual(detail.commits, ["abc1234"]);
  assert.deepEqual(loaded.annotationCoverage, { mapped: 1, total: 2 });
});

test("loadRevision defaults to the newest revision and lists them all", async () => {
  setupStore([revisionDoc({ revision: 1 }), revisionDoc({ revision: 2 })]);
  const loaded = await loadRevision("a-design");
  assert.ok(loaded && !("message" in loaded));
  assert.equal(loaded.revision, 2);
  assert.deepEqual(loaded.revisions, [1, 2]);
});

test("an explicit revision is honoured, and an out-of-range one falls back to current", async () => {
  setupStore([revisionDoc({ revision: 1 }), revisionDoc({ revision: 2 })]);

  const first = await loadRevision("a-design", 1);
  assert.ok(first && !("message" in first));
  assert.equal(first.revision, 1);

  const fallback = await loadRevision("a-design", 99);
  assert.ok(fallback && !("message" in fallback));
  assert.equal(fallback.revision, 2);
});

test("an unknown formatVersion is refused rather than partially rendered", async () => {
  setupStore([revisionDoc({ formatVersion: 2 })]);
  const loaded = await loadRevision("a-design");
  assert.ok(loaded && "message" in loaded);
  assert.match(loaded.message, /formatVersion 2/);
});

test("malformed JSON is reported against its file, not thrown", async () => {
  const dir = setupStore();
  writeFileSync(join(dir, "a-design", "current.json"), "{not json");
  const loaded = await loadRevision("a-design");
  assert.ok(loaded && "message" in loaded);
  assert.match(loaded.file, /current\.json/);
});

test("an unknown slug returns null", async () => {
  setupStore();
  assert.equal(await loadRevision("no-such-sheet"), null);
});

test("a 5-digit revision number is listed and can be loaded explicitly", async () => {
  const dir = setupStore([revisionDoc({ revision: 1 })]);
  const sheet = join(dir, "a-design");
  const tenThousand = revisionDoc({ revision: 10000 });
  writeFileSync(join(sheet, "revisions", "10000.json"), JSON.stringify(tenThousand));
  writeFileSync(join(sheet, "current.json"), JSON.stringify(tenThousand));

  const loaded = await loadRevision("a-design");
  assert.ok(loaded && !("message" in loaded));
  assert.ok(loaded.revisions.includes(10000), `expected revisions to include 10000, got ${loaded.revisions}`);

  const explicit = await loadRevision("a-design", 10000);
  assert.ok(explicit && !("message" in explicit));
  assert.equal(explicit.revision, 10000);
});

test("state and substate edges are mapped from wire keys to synthesised ids", async () => {
  setupStore([
    revisionDoc({
      states: [
        {
          key: "s1",
          label: "First chunk",
          summary: null,
          substates: [
            { key: "task-1", title: "First task", status: "DONE" },
            { key: "task-2", title: "Second task", status: "DONE" },
          ],
        },
        { key: "s2", label: "Second chunk", summary: null, substates: [] },
      ],
      stateEdges: [{ from: "s1", to: "s2" }],
      substateEdges: [{ from: "s1/task-1", to: "s1/task-2" }],
    }),
  ]);

  const loaded = await loadRevision("a-design");
  assert.ok(loaded && !("message" in loaded));
  assert.deepEqual(loaded.graph.stateEdges, [{ fromId: "state-s1", toId: "state-s2" }]);
  assert.deepEqual(loaded.graph.substateEdges, [
    { fromId: "sub-s1-task-1", toId: "sub-s1-task-2" },
  ]);
});
