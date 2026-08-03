import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  countsForSources,
  withCounts,
} from "../../skills/subagent-driven-development/scripts/lib/counts.mjs";

test("no sources means all three counters are zero", () => {
  assert.deepEqual(countsForSources(), { humanCount: 0, aiCount: 0, groundedCount: 0 });
  assert.deepEqual(countsForSources([]), { humanCount: 0, aiCount: 0, groundedCount: 0 });
});

test("only human and ai_assumption drive the two-sided axis", () => {
  const counts = countsForSources([
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

// Each of the four grounded types must land in groundedCount and neither of
// the other two counters - a single combined case could hide one of them
// being miscounted as ai.
for (const source of ["skill_doc", "tool_output", "existing_codebase", "external_reference"]) {
  test(`${source} counts as grounded, not as human or ai`, () => {
    assert.deepEqual(countsForSources([{ source }]), {
      humanCount: 0,
      aiCount: 0,
      groundedCount: 1,
    });
  });
}

test("human and ai_assumption are counted separately from each other", () => {
  assert.deepEqual(countsForSources([{ source: "human" }]), {
    humanCount: 1,
    aiCount: 0,
    groundedCount: 0,
  });
  assert.deepEqual(countsForSources([{ source: "ai_assumption" }]), {
    humanCount: 0,
    aiCount: 1,
    groundedCount: 0,
  });
});

test("withCounts stamps every substate and leaves the rest of the document alone", () => {
  const doc = {
    spec: { path: "a.md", title: "A" },
    states: [
      {
        key: "s1",
        label: "One",
        substates: [
          { key: "task-1", title: "T1", sources: [{ source: "human" }, { source: "skill_doc" }] },
          { key: "task-2", title: "T2" },
        ],
      },
    ],
  };

  const out = withCounts(doc);

  assert.deepEqual(
    out.states[0].substates.map((s) => [s.humanCount, s.aiCount, s.groundedCount]),
    [[1, 0, 1], [0, 0, 0]]
  );
  assert.equal(out.spec.title, "A");
  assert.equal(out.states[0].label, "One");
});

test("withCounts preserves every other substate field", () => {
  const doc = {
    spec: { path: "a.md", title: "A" },
    states: [
      {
        key: "s1",
        label: "One",
        summary: "prose",
        substates: [
          {
            key: "task-1",
            title: "T1",
            status: "DONE",
            notes: "kept",
            commits: ["abc1234"],
            changes: [{ path: "a.ts", summary: "new" }],
            sources: [{ source: "human" }],
          },
        ],
      },
    ],
  };

  const substate = withCounts(doc).states[0].substates[0];

  assert.equal(substate.status, "DONE");
  assert.equal(substate.notes, "kept");
  assert.deepEqual(substate.commits, ["abc1234"]);
  assert.deepEqual(substate.changes, [{ path: "a.ts", summary: "new" }]);
  assert.deepEqual(substate.sources, [{ source: "human" }]);
  assert.equal(withCounts(doc).states[0].summary, "prose");
});

test("withCounts counts each state's substates independently", () => {
  const doc = {
    spec: { path: "a.md", title: "A" },
    states: [
      {
        key: "s1",
        label: "One",
        substates: [{ key: "task-1", title: "T1", sources: [{ source: "human" }] }],
      },
      {
        key: "s2",
        label: "Two",
        substates: [
          { key: "task-2", title: "T2", sources: [{ source: "ai_assumption" }] },
          { key: "task-3", title: "T3", sources: [{ source: "tool_output" }] },
        ],
      },
    ],
  };

  const out = withCounts(doc);

  assert.deepEqual(out.states[0].substates.map((s) => s.humanCount), [1]);
  assert.deepEqual(
    out.states[1].substates.map((s) => [s.humanCount, s.aiCount, s.groundedCount]),
    [[0, 1, 0], [0, 0, 1]]
  );
});

test("withCounts does not mutate its input", () => {
  const doc = {
    spec: { path: "a.md", title: "A" },
    states: [{ key: "s1", label: "One", substates: [{ key: "task-1", title: "T1" }] }],
  };
  withCounts(doc);
  assert.equal(doc.states[0].substates[0].humanCount, undefined);
});
