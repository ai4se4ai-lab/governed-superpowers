import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GraphPublishError,
  assertConsent,
  countSources,
  createGraphStore,
  planGraph,
  type ClientLike,
  type Consent,
  type PoolLike,
  type PublishGraphInput,
} from "../src/graphs.js";

/**
 * The store takes a PoolLike precisely so the SQL shaping can be exercised
 * without Postgres, the same way auth.test.ts stubs the TokenVerifier. The
 * statements themselves are checked by asserting on what was sent.
 */
function stubPool(overrides: Record<string, unknown[]> = {}) {
  const queries: { text: string; values: unknown[] }[] = [];

  const client: ClientLike = {
    async query(text, values = []) {
      queries.push({ text, values });
      for (const [fragment, rows] of Object.entries(overrides)) {
        if (text.includes(fragment)) return { rows };
      }
      if (text.includes('INSERT INTO "Project"')) return { rows: [{ id: "project-1" }] };
      if (text.includes('INSERT INTO "GraphSpec"')) {
        return { rows: [{ id: "spec-1", title: "Auth redesign", inserted: true }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  const pool: PoolLike = { async connect() { return client; } };
  return { pool, queries, find: (f: string) => queries.filter((q) => q.text.includes(f)) };
}

const consent: Consent = {
  version: 1,
  project: { slug: "evergrace", name: "Evergrace", originHash: "sha256:abc" },
  scope: { specPaths: true, substateTitles: true, changePaths: true, annotationText: true },
  grantedAt: new Date("2026-07-20T10:00:00Z").toISOString(),
  grantedBy: "human partner, in session",
  revokedAt: null,
};

function input(overrides: Partial<PublishGraphInput> = {}): PublishGraphInput {
  return {
    consent,
    spec: { path: "docs/specs/2026-07-30-auth-design.md", title: "Auth redesign" },
    states: [
      {
        key: "groundwork",
        label: "Lay the groundwork",
        substates: [
          { key: "task-1", title: "Add the schema", sources: [{ source: "human", text: "must store tokens" }] },
          { key: "task-2", title: "Add the migration", sources: [{ source: "ai_assumption" }] },
        ],
      },
      {
        key: "auth",
        label: "Address auth in connection",
        substates: [{ key: "task-3", title: "Wire the middleware" }],
      },
    ],
    ...overrides,
  };
}

// --------------------------------------------------------------- consent gate

test("a revoked consent record is refused", async () => {
  assert.throws(
    () => assertConsent(input({ consent: { ...consent, revokedAt: new Date().toISOString() } })),
    GraphPublishError
  );
});

test("a consent grant older than a year must be renewed", () => {
  const stale = { ...consent, grantedAt: new Date("2024-01-01T00:00:00Z").toISOString() };

  assert.throws(() => assertConsent(input({ consent: stale })), /over a year old/);
});

test("a consent grant dated in the future is refused", () => {
  const future = { ...consent, grantedAt: new Date(Date.now() + 86_400_000).toISOString() };

  assert.throws(() => assertConsent(input({ consent: future })), /in the future/);
});

test("a field the user declined is refused, not silently stripped", () => {
  // Silently dropping it would let an over-broad payload report success as if
  // it had been sent as written.
  const narrowed = { ...consent, scope: { ...consent.scope, annotationText: false } };

  assert.throws(() => assertConsent(input({ consent: narrowed })), /annotationText is false/);
});

test("declining annotation text still allows a payload that carries none", () => {
  const narrowed = { ...consent, scope: { ...consent.scope, annotationText: false } };
  const payload = input({ consent: narrowed });
  for (const state of payload.states) {
    for (const substate of state.substates) {
      substate.sources = substate.sources?.map((s) => ({ ...s, text: null }));
    }
  }

  assert.doesNotThrow(() => assertConsent(payload));
});

test("a well-formed, current grant passes", () => {
  const fresh = { ...consent, grantedAt: new Date().toISOString() };

  assert.doesNotThrow(() => assertConsent(input({ consent: fresh })));
});

// ------------------------------------------------------------------ counters

test("only human and ai_assumption feed the colour counters", () => {
  const counts = countSources([
    { source: "human" },
    { source: "human" },
    { source: "ai_assumption" },
    { source: "skill_doc" },
    { source: "tool_output" },
    { source: "existing_codebase" },
    { source: "external_reference" },
  ]);

  assert.deepEqual(counts, { humanCount: 2, aiCount: 1, groundedCount: 4 });
});

test("no sources at all yields zero counters, which renders as unknown", () => {
  assert.deepEqual(countSources(), { humanCount: 0, aiCount: 0, groundedCount: 0 });
});

// --------------------------------------------------------------------- plan

test("circle captions run S1..Sn across the whole spec, not per container", () => {
  const plan = planGraph(input());

  assert.deepEqual(
    plan.substates.map((s) => s.label),
    ["S1", "S2", "S3"]
  );
});

test("omitted edges chain containers in order and substates within them", () => {
  const plan = planGraph(input());
  const idOf = (key: string) => plan.substates.find((s) => s.qualifiedKey === key)!.id;

  assert.equal(plan.stateEdges.length, 1);
  assert.equal(plan.stateEdges[0].fromId, plan.states[0].id);
  assert.equal(plan.stateEdges[0].toId, plan.states[1].id);

  // task-1 -> task-2 inside the first container; nothing crosses containers.
  assert.deepEqual(plan.substateEdges, [
    { fromId: idOf("groundwork/task-1"), toId: idOf("groundwork/task-2") },
  ]);
});

test("supplied substate edges are resolved through qualified keys", () => {
  const plan = planGraph(
    input({ substateEdges: [{ from: "groundwork/task-2", to: "auth/task-3" }] })
  );
  const idOf = (key: string) => plan.substates.find((s) => s.qualifiedKey === key)!.id;

  assert.deepEqual(plan.substateEdges, [
    { fromId: idOf("groundwork/task-2"), toId: idOf("auth/task-3") },
  ]);
});

test("an edge pointing at a substate that does not exist is refused", () => {
  assert.throws(
    () => planGraph(input({ substateEdges: [{ from: "groundwork/task-1", to: "auth/task-9" }] })),
    /unknown substate 'auth\/task-9'/
  );
});

test("duplicate state keys are refused rather than silently merged", () => {
  const payload = input();
  payload.states[1].key = "groundwork";

  assert.throws(() => planGraph(payload), /Duplicate state key/);
});

test("every planned node gets a distinct id", () => {
  const plan = planGraph(input());
  const ids = [...plan.states.map((s) => s.id), ...plan.substates.map((s) => s.id)];

  assert.equal(new Set(ids).size, ids.length);
});

// -------------------------------------------------------------------- store

test("publishing never overwrites a sheet-tab title the user renamed", async () => {
  const { pool, find } = stubPool();
  await createGraphStore(pool).publishGraph("user-1", input());

  const [spec] = find('INSERT INTO "GraphSpec"');
  // Just the SET list - RETURNING legitimately mentions title, since the
  // response reports whatever ended up stored.
  const updateClause = spec.text.slice(
    spec.text.indexOf("DO UPDATE"),
    spec.text.indexOf("RETURNING")
  );

  assert.ok(!/\btitle\b/.test(updateClause), "title must not appear in the DO UPDATE set");
  assert.ok(!/"order"/.test(updateClause), '"order" must not appear in the DO UPDATE set');
  assert.ok(/"lastPublishedAt"/.test(updateClause), "lastPublishedAt should still be refreshed");
});

test("publishing reports the stored title, not the one it sent", async () => {
  // The user renamed the tab to "Auth, take two"; the agent still sends the
  // original spec title. The response must reflect what is actually stored.
  const { pool } = stubPool({
    'INSERT INTO "GraphSpec"': [{ id: "spec-1", title: "Auth, take two", inserted: false }],
  });

  const result = await createGraphStore(pool).publishGraph("user-1", input());

  assert.equal(result.specTitle, "Auth, take two");
  assert.equal(result.created, false);
});

test("a re-publish replaces the graph below the spec row", async () => {
  const { pool, find } = stubPool();
  await createGraphStore(pool).publishGraph("user-1", input());

  assert.equal(find('DELETE FROM "GraphState"').length, 1);
  assert.equal(find('DELETE FROM "GraphStateEdge"').length, 1);
  assert.equal(find('DELETE FROM "GraphSubstateEdge"').length, 1);
});

test("the whole publish runs in one transaction", async () => {
  const { pool, queries } = stubPool();
  await createGraphStore(pool).publishGraph("user-1", input());

  assert.equal(queries[0].text, "BEGIN");
  assert.equal(queries.at(-1)?.text, "COMMIT");
});

test("a failure mid-publish rolls back rather than leaving a half-written graph", async () => {
  const queries: string[] = [];
  const client: ClientLike = {
    async query(text) {
      queries.push(text);
      if (text.includes('INSERT INTO "GraphSubstate"')) throw new Error("boom");
      if (text.includes('INSERT INTO "Project"')) return { rows: [{ id: "project-1" }] };
      if (text.includes('INSERT INTO "GraphSpec"')) {
        return { rows: [{ id: "spec-1", title: "Auth redesign", inserted: true }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  await assert.rejects(
    createGraphStore({ async connect() { return client; } }).publishGraph("user-1", input()),
    /boom/
  );
  assert.ok(queries.includes("ROLLBACK"), "expected a ROLLBACK");
});

test("the connection is released even when the publish fails", async () => {
  let released = false;
  const client: ClientLike = {
    async query(text) {
      if (text.includes('INSERT INTO "Project"')) throw new Error("boom");
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };

  await assert.rejects(
    createGraphStore({ async connect() { return client; } }).publishGraph("user-1", input())
  );
  assert.equal(released, true);
});

test("a slug already claimed by a different repository is refused", async () => {
  const { pool } = stubPool({
    'SELECT id, "consentScope" FROM "Project"': [
      { id: "project-1", consentScope: { originHash: "sha256:different" } },
    ],
  });

  await assert.rejects(
    createGraphStore(pool).publishGraph("user-1", input()),
    /already used by a different repository/
  );
});

test("publishing scopes every write to the calling user", async () => {
  const { pool, find } = stubPool();
  await createGraphStore(pool).publishGraph("user-42", input());

  const [project] = find('INSERT INTO "Project"');
  assert.ok(project.values.includes("user-42"), "the project row must carry the caller's userId");
});

test("revoking a spec cannot reach another user's project", async () => {
  const { pool, find } = stubPool({ 'SELECT id FROM "Project"': [] });

  const result = await createGraphStore(pool).revokeGraph("user-1", {
    projectSlug: "evergrace",
    specPath: "docs/specs/x.md",
  });

  assert.deepEqual(result, { removedSpecs: 0, removedProject: false });
  assert.equal(find('DELETE FROM "GraphSpec"').length, 0, "must not delete when the lookup missed");
  const [lookup] = find('SELECT id FROM "Project"');
  assert.deepEqual(lookup.values, ["user-1", "evergrace"]);
});

test("revoking with all: true removes the project too", async () => {
  const { pool } = stubPool({
    'SELECT id FROM "Project"': [{ id: "project-1" }],
    'DELETE FROM "GraphSpec"': [{ id: "spec-1" }, { id: "spec-2" }],
  });

  const result = await createGraphStore(pool).revokeGraph("user-1", {
    projectSlug: "evergrace",
    all: true,
  });

  assert.deepEqual(result, { removedSpecs: 2, removedProject: true });
});

test("listGraphs only ever asks for the calling user's rows", async () => {
  const { pool, find } = stubPool();
  await createGraphStore(pool).listGraphs("user-7");

  const [query] = find('FROM "Project"');
  assert.deepEqual(query.values, ["user-7"]);
  assert.ok(query.text.includes('p."userId" = $1'));
});
