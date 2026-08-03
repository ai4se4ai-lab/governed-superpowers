import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  FORMAT_VERSION,
  findRepoRoot,
  graphsDir,
  listRevisions,
  nextRevisionNumber,
  readIndex,
  repoRoot,
  revisionPath,
  sheetDir,
  slugForSpec,
  upsertSheet,
  writeIndex,
  writeJsonAtomic,
} from "../../skills/subagent-driven-development/scripts/lib/store.mjs";

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "sdd-graph-store-"));
}

test("findRepoRoot walks up to the directory holding .git", () => {
  const root = tempRoot();
  mkdirSync(join(root, ".git"), { recursive: true });
  const deep = join(root, "a", "b", "c");
  mkdirSync(deep, { recursive: true });

  assert.equal(findRepoRoot(deep), root);
  assert.equal(findRepoRoot(root), root);
});

test("findRepoRoot returns null when no .git is found", () => {
  assert.equal(findRepoRoot(tempRoot()), null);
});

test("findRepoRoot accepts a .git file, as found in a worktree", () => {
  const root = tempRoot();
  writeFileSync(join(root, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");
  assert.equal(findRepoRoot(root), root);
});

test("repoRoot prefers SDD_GRAPH_ROOT and throws when there is no repository", (t) => {
  const prior = process.env.SDD_GRAPH_ROOT;
  t.after(() => {
    if (prior === undefined) delete process.env.SDD_GRAPH_ROOT;
    else process.env.SDD_GRAPH_ROOT = prior;
  });
  const root = tempRoot();
  process.env.SDD_GRAPH_ROOT = root;
  assert.equal(repoRoot(tempRoot()), root);
  delete process.env.SDD_GRAPH_ROOT;
  assert.throws(() => repoRoot(tempRoot()), /SDD_GRAPH_ROOT/);
});

test("slugForSpec drops the directory and the .md extension", () => {
  assert.equal(
    slugForSpec("docs/governed-superpowers/specs/2026-08-03-example-design.md"),
    "2026-08-03-example-design"
  );
  assert.equal(slugForSpec("docs/spec"), "spec");
  assert.equal(slugForSpec("a.md.backup"), "a.md.backup");
  assert.throws(() => slugForSpec(""));
  assert.throws(() => slugForSpec("."));
  assert.throws(() => slugForSpec(".."));
});

test("graphsDir and sheetDir sit under .governed-superpowers", () => {
  const root = tempRoot();
  assert.equal(graphsDir(root), join(root, ".governed-superpowers", "graphs"));
  assert.equal(sheetDir(root, "a-spec"), join(root, ".governed-superpowers", "graphs", "a-spec"));
});

test("nextRevisionNumber starts at 1 and follows the highest file on disk", () => {
  const root = tempRoot();
  const dir = sheetDir(root, "a-spec");
  assert.equal(nextRevisionNumber(dir), 1);

  mkdirSync(join(dir, "revisions"), { recursive: true });
  writeFileSync(join(dir, "revisions", "0001.json"), "{}");
  writeFileSync(join(dir, "revisions", "0002.json"), "{}");
  writeFileSync(join(dir, "revisions", "notes.txt"), "ignored");
  writeFileSync(join(dir, "revisions", "001.json"), "ignored");

  assert.deepEqual(listRevisions(dir), [1, 2]);
  assert.equal(nextRevisionNumber(dir), 3);

  writeFileSync(join(dir, "revisions", "10000.json"), "{}");
  assert.deepEqual(listRevisions(dir), [1, 2, 10000]);
  assert.equal(nextRevisionNumber(dir), 10001);
});

test("revisionPath zero-pads to four digits", () => {
  assert.equal(revisionPath("/d", 7), join("/d", "revisions", "0007.json"));
  assert.equal(revisionPath("/d", 1234), join("/d", "revisions", "1234.json"));
});

test("writeJsonAtomic creates parent directories and leaves no temp file behind", () => {
  const root = tempRoot();
  const target = join(root, "deep", "nested", "file.json");
  writeJsonAtomic(target, { a: 1 });

  assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { a: 1 });
  assert.deepEqual(readdirSync(join(root, "deep", "nested")), ["file.json"]);
});

test("readIndex returns an empty index when none exists, and round-trips", () => {
  const root = tempRoot();
  assert.deepEqual(readIndex(root), { formatVersion: FORMAT_VERSION, sheets: [] });

  writeIndex(root, upsertSheet(readIndex(root), { slug: "b-spec", currentRevision: 1 }));
  assert.deepEqual(readIndex(root).sheets, [{ slug: "b-spec", currentRevision: 1 }]);
});

test("upsertSheet replaces an existing slug rather than duplicating it", () => {
  let index = { formatVersion: FORMAT_VERSION, sheets: [] };
  index = upsertSheet(index, { slug: "b-spec", currentRevision: 1 });
  index = upsertSheet(index, { slug: "a-spec", currentRevision: 5 });
  index = upsertSheet(index, { slug: "b-spec", currentRevision: 2 });

  assert.deepEqual(
    index.sheets.map((sheet) => [sheet.slug, sheet.currentRevision]),
    [["a-spec", 5], ["b-spec", 2]]
  );
});
