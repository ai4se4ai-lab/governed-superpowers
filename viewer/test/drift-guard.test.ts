import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * graph-color.ts, graph-layout.ts, globals.css, and theme.js are copied from
 * the portal rather than shared through a package. This test is what keeps
 * the copy honest: the viewer and the portal must colour and lay out an
 * identical graph identically, or the viewer stops being a preview of what
 * gets published. graph-color.ts only returns CSS variable names
 * (`var(--prov-human)`, etc.) - the actual colors live in globals.css, and
 * theme.js governs which color scheme applies - so both must be covered too,
 * or a retuned color/theme in the portal could drift silently. If the
 * portal's version changes deliberately, copy it across - do not relax this
 * assertion.
 */
const HERE = fileURLToPath(new URL(".", import.meta.url));

const COPIED = [
  "src/lib/graph-color.ts",
  "src/lib/graph-layout.ts",
  "src/app/globals.css",
  "public/theme.js",
];

for (const file of COPIED) {
  test(`viewer/${file} is byte-identical to the portal's`, () => {
    const viewer = readFileSync(join(HERE, "..", file), "utf8");
    const portal = readFileSync(join(HERE, "..", "..", "web", file), "utf8");
    assert.equal(viewer, portal, `${file} has drifted from web/${file}`);
  });
}
