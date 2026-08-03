import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PROVENANCE_SOURCES,
  SUBSTATE_STATUSES,
  validateDocument,
} from "../../skills/subagent-driven-development/scripts/lib/validate.mjs";

/** A minimal document that must validate; each case below mutates a copy. */
function validDoc() {
  return {
    spec: { path: "docs/specs/a-design.md", title: "A design", planPath: "docs/plans/a.md" },
    trigger: { task: 1, reason: "task-complete" },
    states: [
      {
        key: "s1",
        label: "First chunk",
        summary: null,
        substates: [
          {
            key: "task-1",
            title: "Do the thing",
            status: "DONE",
            changes: [{ path: "a.ts", summary: "new file" }],
            commits: ["abc1234"],
            notes: null,
            sources: [{ marker: "1", source: "human", ref: null, text: "It must do the thing." }],
          },
        ],
      },
    ],
    stateEdges: [],
    substateEdges: [],
    annotationCoverage: { mapped: 1, total: 1 },
  };
}

test("a well-formed document validates", () => {
  assert.deepEqual(validateDocument(validDoc()), { ok: true });
});

test("the six provenance sources and three statuses are the accepted vocabularies", () => {
  assert.deepEqual(PROVENANCE_SOURCES, [
    "human",
    "ai_assumption",
    "skill_doc",
    "tool_output",
    "existing_codebase",
    "external_reference",
  ]);
  assert.deepEqual(SUBSTATE_STATUSES, ["DONE", "DONE_WITH_CONCERNS", "BLOCKED"]);
});

test("a non-object document is rejected", () => {
  assert.deepEqual(validateDocument([]), { ok: false, path: "", message: "must be an object" });
});

test("an empty spec.path is rejected by path", () => {
  const doc = validDoc();
  doc.spec.path = "";
  assert.equal(validateDocument(doc).path, "spec.path");
});

test("a missing spec.title is rejected by path", () => {
  const doc = validDoc();
  delete doc.spec.title;
  assert.equal(validateDocument(doc).path, "spec.title");
});

test("states must be a non-empty array", () => {
  const doc = validDoc();
  doc.states = [];
  assert.equal(validateDocument(doc).path, "states");
});

test("a state with no substates is rejected, mirroring the server schema", () => {
  const doc = validDoc();
  doc.states[0].substates = [];
  assert.equal(validateDocument(doc).path, "states[0].substates");
});

test("an empty substate title is rejected with its index in the path", () => {
  const doc = validDoc();
  doc.states[0].substates[0].title = "";
  assert.equal(validateDocument(doc).path, "states[0].substates[0].title");
});

test("an unknown status is rejected", () => {
  const doc = validDoc();
  doc.states[0].substates[0].status = "FINISHED";
  assert.equal(validateDocument(doc).path, "states[0].substates[0].status");
});

test("a null status is allowed", () => {
  const doc = validDoc();
  doc.states[0].substates[0].status = null;
  assert.deepEqual(validateDocument(doc), { ok: true });
});

test("an unknown provenance source is rejected", () => {
  const doc = validDoc();
  doc.states[0].substates[0].sources[0].source = "vibes";
  assert.equal(validateDocument(doc).path, "states[0].substates[0].sources[0].source");
});

test("duplicate state keys are rejected", () => {
  const doc = validDoc();
  doc.states.push({ ...doc.states[0] });
  assert.equal(validateDocument(doc).path, "states[1].key");
});

test("duplicate substate keys within one state are rejected", () => {
  const doc = validDoc();
  doc.states[0].substates.push({ ...doc.states[0].substates[0] });
  assert.equal(validateDocument(doc).path, "states[0].substates[1].key");
});

test("a null state entry is rejected, not thrown, with the state's own path", () => {
  const doc = validDoc();
  doc.states = [null];
  let result;
  assert.doesNotThrow(() => {
    result = validateDocument(doc);
  });
  assert.deepEqual(result, { ok: false, path: "states[0]", message: "must be an object" });
});

test("a null substate entry is rejected, not thrown, with the substate's own path", () => {
  const doc = validDoc();
  doc.states[0].substates = [null];
  let result;
  assert.doesNotThrow(() => {
    result = validateDocument(doc);
  });
  assert.deepEqual(result, {
    ok: false,
    path: "states[0].substates[0]",
    message: "must be an object",
  });
});

test("a non-array sources value is rejected, not thrown", () => {
  const doc = validDoc();
  doc.states[0].substates[0].sources = {};
  let result;
  assert.doesNotThrow(() => {
    result = validateDocument(doc);
  });
  assert.deepEqual(result, {
    ok: false,
    path: "states[0].substates[0].sources",
    message: "must be an array",
  });
});

test("absent or null sources are still allowed", () => {
  const doc = validDoc();
  delete doc.states[0].substates[0].sources;
  assert.deepEqual(validateDocument(doc), { ok: true });

  const doc2 = validDoc();
  doc2.states[0].substates[0].sources = null;
  assert.deepEqual(validateDocument(doc2), { ok: true });
});
