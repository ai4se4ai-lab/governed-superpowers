import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * graph-color.ts and graph-layout.ts are import-free pure modules, copied from
 * the portal rather than shared through a package. This test is what keeps the
 * copy honest: the viewer and the portal must colour and lay out an identical
 * graph identically, or the viewer stops being a preview of what gets
 * published. If the portal's version changes deliberately, copy it across -
 * do not relax this assertion.
 */
const COPIED = ["graph-color.ts", "graph-layout.ts"];

for (const file of COPIED) {
  test(`viewer/src/lib/${file} is byte-identical to the portal's`, () => {
    const viewer = readFileSync(join(process.cwd(), "src", "lib", file), "utf8");
    const portal = readFileSync(join(process.cwd(), "..", "web", "src", "lib", file), "utf8");
    assert.equal(viewer, portal, `${file} has drifted from web/src/lib/${file}`);
  });
}
