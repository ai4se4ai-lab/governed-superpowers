import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_THRESHOLD,
  HUMAN_THRESHOLD,
  categorise,
  mixCaption,
  mixOf,
  themeFor,
} from "../src/lib/graph-color.js";

test("no human or ai sources at all is unknown, never mixed", () => {
  // The day-one case: a spec published with no .annotations.json sidecar. It
  // must read as "we don't know", not as "perfectly balanced".
  assert.equal(categorise({ human: 0, ai: 0, grounded: 0 }), "unknown");
  assert.equal(categorise({ human: 0, ai: 0, grounded: 12 }), "unknown");
});

test("grounded sources never shift the human/ai balance", () => {
  const withoutGrounded = categorise({ human: 4, ai: 1, grounded: 0 });
  const withGrounded = categorise({ human: 4, ai: 1, grounded: 50 });

  assert.equal(withoutGrounded, "human");
  assert.equal(withGrounded, "human");
});

test("lopsided mixes land on the expected colour", () => {
  assert.equal(categorise({ human: 5, ai: 0, grounded: 0 }), "human");
  assert.equal(categorise({ human: 0, ai: 5, grounded: 0 }), "ai");
  assert.equal(categorise({ human: 1, ai: 1, grounded: 0 }), "mixed");
});

test("the thresholds are inclusive on both ends", () => {
  // Exactly at HUMAN_THRESHOLD counts as human; exactly at AI_THRESHOLD counts
  // as ai. A value strictly between them is mixed.
  assert.equal(categorise({ human: 13, ai: 7, grounded: 0 }), "human"); // 0.65
  assert.equal(categorise({ human: 7, ai: 13, grounded: 0 }), "ai"); // 0.35
  assert.equal(categorise({ human: 12, ai: 8, grounded: 0 }), "mixed"); // 0.60
  assert.equal(categorise({ human: 8, ai: 12, grounded: 0 }), "mixed"); // 0.40

  assert.ok(HUMAN_THRESHOLD > AI_THRESHOLD, "thresholds must not cross");
});

test("a single source decides the category outright", () => {
  assert.equal(categorise({ human: 1, ai: 0, grounded: 0 }), "human");
  assert.equal(categorise({ human: 0, ai: 1, grounded: 0 }), "ai");
});

test("mixOf sums the denormalised counters across substates", () => {
  const mix = mixOf([
    { humanCount: 2, aiCount: 1, groundedCount: 3 },
    { humanCount: 0, aiCount: 4, groundedCount: 0 },
    { humanCount: 1, aiCount: 0, groundedCount: 2 },
  ]);

  assert.deepEqual(mix, { human: 3, ai: 5, grounded: 5 });
});

test("mixOf over no substates is the empty mix, and categorises as unknown", () => {
  const mix = mixOf([]);

  assert.deepEqual(mix, { human: 0, ai: 0, grounded: 0 });
  assert.equal(categorise(mix), "unknown");
});

test("mixOf does not mutate the shared empty mix between calls", () => {
  mixOf([{ humanCount: 9, aiCount: 9, groundedCount: 9 }]);

  assert.deepEqual(mixOf([]), { human: 0, ai: 0, grounded: 0 });
});

test("every category has a distinct wash and a spelled-out label", () => {
  const categories = ["human", "ai", "mixed", "unknown"] as const;
  const washes = new Set(categories.map((c) => themeFor(c).wash));

  assert.equal(washes.size, categories.length, "washes must be distinguishable");
  for (const c of categories) {
    assert.ok(themeFor(c).label.length > 0, `${c} needs a text label`);
  }
});

test("mixCaption states the counts so colour is never the only signal", () => {
  assert.equal(mixCaption({ human: 1, ai: 4, grounded: 0 }), "HUMAN 1 · AI 4");
  assert.equal(mixCaption({ human: 0, ai: 4, grounded: 2 }), "AI 4 · GROUNDED 2");
  assert.equal(mixCaption({ human: 0, ai: 0, grounded: 0 }), "No provenance data");
});
