import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { applyScope } from "../../skills/subagent-driven-development/scripts/lib/scope.mjs";

function consent(scope = {}) {
  return {
    version: 1,
    project: { slug: "demo", name: "Demo", originHash: "sha256:abc" },
    scope: {
      specPaths: true,
      substateTitles: true,
      changePaths: true,
      annotationText: true,
      ...scope,
    },
    grantedAt: "2026-08-01T14:22:10Z",
    grantedBy: "human partner, in session",
    revokedAt: null,
  };
}

function revision() {
  return {
    formatVersion: 1,
    revision: 2,
    builtAt: "2026-08-03T10:00:00Z",
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
            sources: [{ marker: "1", source: "human", ref: "a.ts:1", text: "Must do it." }],
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
    publish: { sentAt: null, skippedReason: null, omittedFields: [] },
  };
}

test("full consent sends everything except the local-only fields", () => {
  const { payload, omittedFields } = applyScope(revision(), consent());
  const substate = payload.states[0].substates[0];

  assert.equal(payload.spec.path, "docs/specs/a-design.md");
  assert.equal(payload.states[0].label, "First chunk");
  assert.deepEqual(substate.changes, [{ path: "a.ts", summary: "new file" }]);
  assert.equal(substate.sources[0].text, "Must do it.");
  assert.deepEqual(payload.annotationCoverage, { mapped: 1, total: 2 });
  assert.equal(payload.consent.project.slug, "demo");

  assert.equal(substate.notes, undefined, "notes are never sent");
  assert.equal(substate.humanCount, undefined, "local counters are never sent");
  assert.deepEqual(omittedFields, ["substates.notes"]);
});

test("changePaths off omits changes entirely rather than sending an empty array", () => {
  const { payload, omittedFields } = applyScope(revision(), consent({ changePaths: false }));
  assert.equal("changes" in payload.states[0].substates[0], false);
  assert.ok(omittedFields.includes("substates.changes"));
});

test("annotationText off drops text but keeps source and ref", () => {
  const { payload, omittedFields } = applyScope(revision(), consent({ annotationText: false }));
  const source = payload.states[0].substates[0].sources[0];

  assert.equal("text" in source, false);
  assert.equal(source.source, "human");
  assert.equal(source.ref, "a.ts:1");
  assert.ok(omittedFields.includes("sources.text"));
});

test("specPaths off substitutes a stable opaque path and title", () => {
  const digest = createHash("sha256").update("docs/specs/a-design.md").digest("hex");
  const { payload, omittedFields } = applyScope(revision(), consent({ specPaths: false }));

  assert.equal(payload.spec.path, `opaque:${digest.slice(0, 16)}`);
  assert.equal(payload.spec.title, `Sheet ${digest.slice(0, 8)}`);
  assert.equal(payload.spec.planPath, null);
  assert.ok(omittedFields.includes("spec.path"));

  const again = applyScope(revision(), consent({ specPaths: false }));
  assert.equal(again.payload.spec.path, payload.spec.path, "must be stable across calls");
});

test("substateTitles off neutralises task titles and state labels together", () => {
  const { payload, omittedFields } = applyScope(revision(), consent({ substateTitles: false }));

  assert.equal(payload.states[0].label, "Group 1");
  assert.equal("summary" in payload.states[0], false);
  assert.equal(payload.states[0].substates[0].title, "Task 1");
  assert.ok(omittedFields.includes("substates.title"));
});

test("a substate key that is not task-N still yields a non-empty title", () => {
  const doc = revision();
  doc.states[0].substates[0].key = "cleanup";
  const { payload } = applyScope(doc, consent({ substateTitles: false }));
  assert.equal(payload.states[0].substates[0].title, "Task");
});
