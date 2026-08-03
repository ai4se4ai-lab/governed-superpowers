# Local Collaboration-Graph Build and Docker Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reference spec:** `docs/governed-superpowers/specs/2026-08-03-local-graph-build-and-viewer-design.md`

**Goal:** Build every plan's collaboration graph to disk on each completed task regardless of consent, and turn publishing into a scope-filtered export of that local artifact, viewable through a Docker-run local web viewer with revision replay.

**Architecture:** A dependency-free Node CLI (`sdd-graph`) owns a git-ignored revision store under `.governed-superpowers/graphs/`. Its logic lives in a `run(argv, io)` function that takes its I/O as an argument, so the whole CLI is testable in-process without spawning anything; the executable is a thin shim. A Next.js app in `viewer/`, started by its own compose file, mounts that directory read-only and renders it with the portal's canvas.

**Tech Stack:** Node 20+ (no third-party dependencies for the CLI), `node --test` for CLI tests, Next.js 15 + React 19 + `@xyflow/react` + Tailwind v4 for the viewer, `tsx --test` for viewer tests, Docker Compose.

---

## File Structure

**New — CLI (all dependency-free ESM):**

| File | Responsibility |
|---|---|
| `skills/subagent-driven-development/scripts/sdd-graph` | Executable shim: wires real stdin/stdout/stderr into `run()` and exits with its code |
| `skills/subagent-driven-development/scripts/lib/cli.mjs` | `run(argv, io)` — argument parsing and the three subcommands |
| `skills/subagent-driven-development/scripts/lib/store.mjs` | Repo root discovery, paths, slugs, revision numbering, atomic writes, index read/write |
| `skills/subagent-driven-development/scripts/lib/validate.mjs` | Shape validation of the incoming graph document |
| `skills/subagent-driven-development/scripts/lib/counts.mjs` | Provenance count computation |
| `skills/subagent-driven-development/scripts/lib/scope.mjs` | Consent-scope filtering into the wire payload |

**New — CLI tests:**

| File | Responsibility |
|---|---|
| `tests/local-graphs/store.test.mjs` | Repo root discovery, slugs, revision numbering, index upsert, atomic write |
| `tests/local-graphs/validate.test.mjs` | Every rejection path and the accepting path |
| `tests/local-graphs/counts.test.mjs` | Count computation across all six source types |
| `tests/local-graphs/scope.test.mjs` | Each scope flag's omission and substitution |
| `tests/local-graphs/cli.test.mjs` | `write` / `payload` / `record-publish` end-to-end, in-process |
| `tests/local-graphs/test-local-graphs.sh` | Shell wrapper, so the suite is discoverable like the repo's other `test-*.sh` |
| `tests/local-graphs/test-sdd-publish.sh` | Bash test for the bash script changed in Task 8 |

**New — viewer:**

| File | Responsibility |
|---|---|
| `viewer/package.json`, `viewer/tsconfig.json`, `viewer/next.config.ts`, `viewer/postcss.config.mjs` | App configuration, mirroring `web/`'s |
| `viewer/Dockerfile` | deps → builder → standalone runtime, no Prisma stages |
| `viewer/src/lib/graph-color.ts`, `viewer/src/lib/graph-layout.ts` | Byte-identical copies of the portal's, guarded by a test |
| `viewer/src/lib/graph-store.ts` | Filesystem → `GraphPayload`; the only new data-access code |
| `viewer/src/app/layout.tsx`, `viewer/src/app/globals.css` | Shell and theme, copied from `web/` |
| `viewer/src/app/page.tsx` | Sheet list from `index.json` |
| `viewer/src/app/sheet/[slug]/page.tsx` | Canvas for one sheet at one revision |
| `viewer/src/app/sheet/[slug]/sheet-view.tsx` | Client shell: canvas plus detail drawer |
| `viewer/src/app/sheet/[slug]/revision-scrubber.tsx` | Revision selector |
| `viewer/src/app/sheet/[slug]/publish-banner.tsx` | Per-revision publish outcome |
| `viewer/src/app/graphs/*` | Canvas components copied from the portal, plus local types |
| `viewer/src/app/api/healthz/route.ts` | Container healthcheck |
| `viewer/test/*.test.ts` | Store loading, drift guard, malformed input |

**New — root:** `docker-compose.viewer.yml`

**Modified:** `skills/subagent-driven-development/scripts/sdd-publish`, `skills/subagent-driven-development/publishing-graphs.md`, `skills/subagent-driven-development/SKILL.md`, `docs/governed-superpowers/how-governed-superpowers-works.md`, `README.md`.

**Not modified:** `.gitignore` already ignores `.governed-superpowers/` (line 4), so the new store is git-ignored without any change.

---

## Task 1: Store module — repo root, paths, revision numbering

**Files:**
- Create: `skills/subagent-driven-development/scripts/lib/store.mjs`
- Test: `tests/local-graphs/store.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/local-graphs/store.test.mjs`:

```js
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

test("slugForSpec drops the directory and the .md extension", () => {
  assert.equal(
    slugForSpec("docs/governed-superpowers/specs/2026-08-03-example-design.md"),
    "2026-08-03-example-design"
  );
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

  assert.deepEqual(listRevisions(dir), [1, 2]);
  assert.equal(nextRevisionNumber(dir), 3);
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
  // Inspect the directory the file landed in - listRevisions() would look in a
  // `revisions/` subdirectory that does not exist here, and so would return []
  // whether or not a stray .tmp file survived.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/store.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/store.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/subagent-driven-development/scripts/lib/store.mjs`:

```js
/**
 * On-disk layout of the local collaboration-graph store.
 *
 * Everything here is mechanical: paths, revision numbering, atomic writes.
 * Nothing in this module interprets the contents of a graph document.
 *
 * The repository root is found by walking up for a .git directory rather than
 * shelling out to git - one less runtime dependency, and it keeps every
 * function here pure filesystem work that a test can drive with a temp
 * directory.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const FORMAT_VERSION = 1;

export function findRepoRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * SDD_GRAPH_ROOT exists so tests (and anyone driving the CLI from outside a
 * checkout) can point the store at an explicit directory.
 */
export function repoRoot(cwd = process.cwd()) {
  if (process.env.SDD_GRAPH_ROOT) return process.env.SDD_GRAPH_ROOT;
  const found = findRepoRoot(cwd);
  if (!found) throw new Error("not inside a git repository, and SDD_GRAPH_ROOT is not set");
  return found;
}

export function graphsDir(root) {
  return join(root, ".governed-superpowers", "graphs");
}

export function sheetDir(root, slug) {
  return join(graphsDir(root), slug);
}

export function slugForSpec(specPath) {
  return basename(specPath).replace(/\.md$/, "");
}

export function listRevisions(dir) {
  const revisions = join(dir, "revisions");
  if (!existsSync(revisions)) return [];
  return readdirSync(revisions)
    .filter((file) => /^\d{4}\.json$/.test(file))
    .map((file) => Number(file.slice(0, 4)))
    .sort((a, b) => a - b);
}

/** Allocated from the directory itself, so there is no counter to desynchronise. */
export function nextRevisionNumber(dir) {
  const revisions = listRevisions(dir);
  return revisions.length === 0 ? 1 : revisions[revisions.length - 1] + 1;
}

export function revisionPath(dir, n) {
  return join(dir, "revisions", `${String(n).padStart(4, "0")}.json`);
}

/** Write-then-rename: a crash mid-write can never leave a half-parsed revision. */
export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readIndex(root) {
  const path = join(graphsDir(root), "index.json");
  if (!existsSync(path)) return { formatVersion: FORMAT_VERSION, sheets: [] };
  return readJson(path);
}

export function writeIndex(root, index) {
  writeJsonAtomic(join(graphsDir(root), "index.json"), index);
}

/** Rewritten in full on every build, so a damaged entry heals on the next task. */
export function upsertSheet(index, entry) {
  const sheets = (index.sheets ?? []).filter((sheet) => sheet.slug !== entry.slug);
  sheets.push(entry);
  sheets.sort((a, b) => a.slug.localeCompare(b.slug));
  return { formatVersion: FORMAT_VERSION, sheets };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/local-graphs/store.test.mjs`
Expected: PASS — 9 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/lib/store.mjs tests/local-graphs/store.test.mjs
git commit -m "feat: add local graph store paths and revision numbering"
```

> **As landed** (`573bd78`, `c80b76c`, `61127ee`) — read `store.mjs` itself rather than the block above, which is the pre-review draft. Code review added, and later tasks depend on: `SDD_GRAPH_ROOT` is `resolve`d so `repoRoot()` is always absolute; `listRevisions` matches `^\d{4,}\.json$` so numbering does not silently stop at 9999; `slugForSpec` throws on `""`, `"."` and `".."` rather than returning a slug that escapes the store; `readIndex` wraps a JSON parse failure in an actionable message naming the file; and the `.git` check is documented as deliberately accepting both the directory and the worktree file form. Tests grew from 9 to 11.

---

## Task 2: Document validation

**Files:**
- Create: `skills/subagent-driven-development/scripts/lib/validate.mjs`
- Test: `tests/local-graphs/validate.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/local-graphs/validate.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/validate.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/validate.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/subagent-driven-development/scripts/lib/validate.mjs`:

```js
/**
 * Shape validation for an incoming graph document.
 *
 * Deliberately mirrors the constraints in mcp-server/src/tools.ts (min-1
 * states, min-1 substates per state, the source and status enums) so a
 * document that builds locally is one the server would also accept once
 * scope-filtered. Returns the first failure with a JSON-path-ish location
 * rather than throwing, so the CLI can report exactly which field is wrong.
 */

export const PROVENANCE_SOURCES = [
  "human",
  "ai_assumption",
  "skill_doc",
  "tool_output",
  "existing_codebase",
  "external_reference",
];

export const SUBSTATE_STATUSES = ["DONE", "DONE_WITH_CONCERNS", "BLOCKED"];

function fail(path, message) {
  return { ok: false, path, message };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateDocument(doc) {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return fail("", "must be an object");
  }

  const spec = doc.spec;
  if (typeof spec !== "object" || spec === null) return fail("spec", "must be an object");
  if (!isNonEmptyString(spec.path)) return fail("spec.path", "must be a non-empty string");
  if (!isNonEmptyString(spec.title)) return fail("spec.title", "must be a non-empty string");

  if (!Array.isArray(doc.states) || doc.states.length === 0) {
    return fail("states", "must be a non-empty array");
  }

  const stateKeys = new Set();
  for (const [i, state] of doc.states.entries()) {
    const at = `states[${i}]`;
    if (!isNonEmptyString(state.key)) return fail(`${at}.key`, "must be a non-empty string");
    if (stateKeys.has(state.key)) return fail(`${at}.key`, `duplicate state key '${state.key}'`);
    stateKeys.add(state.key);

    if (!isNonEmptyString(state.label)) return fail(`${at}.label`, "must be a non-empty string");
    if (!Array.isArray(state.substates) || state.substates.length === 0) {
      return fail(`${at}.substates`, "must be a non-empty array");
    }

    const substateKeys = new Set();
    for (const [j, substate] of state.substates.entries()) {
      const subAt = `${at}.substates[${j}]`;
      if (!isNonEmptyString(substate.key)) return fail(`${subAt}.key`, "must be a non-empty string");
      if (substateKeys.has(substate.key)) {
        return fail(`${subAt}.key`, `duplicate substate key '${substate.key}'`);
      }
      substateKeys.add(substate.key);

      if (!isNonEmptyString(substate.title)) {
        return fail(`${subAt}.title`, "must be a non-empty string");
      }
      if (
        substate.status !== null &&
        substate.status !== undefined &&
        !SUBSTATE_STATUSES.includes(substate.status)
      ) {
        return fail(`${subAt}.status`, `must be one of ${SUBSTATE_STATUSES.join(", ")}`);
      }

      for (const [k, source] of (substate.sources ?? []).entries()) {
        if (!PROVENANCE_SOURCES.includes(source?.source)) {
          return fail(
            `${subAt}.sources[${k}].source`,
            `must be one of ${PROVENANCE_SOURCES.join(", ")}`
          );
        }
      }
    }
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/local-graphs/validate.test.mjs`
Expected: PASS — 13 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/lib/validate.mjs tests/local-graphs/validate.test.mjs
git commit -m "feat: validate local graph documents before writing a revision"
```

---

## Task 3: Provenance count computation

**Files:**
- Create: `skills/subagent-driven-development/scripts/lib/counts.mjs`
- Test: `tests/local-graphs/counts.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/local-graphs/counts.test.mjs`:

```js
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

test("withCounts does not mutate its input", () => {
  const doc = {
    spec: { path: "a.md", title: "A" },
    states: [{ key: "s1", label: "One", substates: [{ key: "task-1", title: "T1" }] }],
  };
  withCounts(doc);
  assert.equal(doc.states[0].substates[0].humanCount, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/counts.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/counts.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/subagent-driven-development/scripts/lib/counts.mjs`:

```js
/**
 * Denormalised provenance counters, computed once at write time.
 *
 * The rule is the portal's, in web/src/lib/graph-color.ts: `human` and
 * `ai_assumption` are the only two sources that say who *decided* a
 * requirement belonged in the spec, so only they feed the red/blue axis. The
 * other four are evidence, counted separately. Precomputing here means the
 * viewer never has to know the taxonomy.
 */

export function countsForSources(sources = []) {
  let humanCount = 0;
  let aiCount = 0;
  let groundedCount = 0;

  for (const source of sources) {
    if (source.source === "human") humanCount += 1;
    else if (source.source === "ai_assumption") aiCount += 1;
    else groundedCount += 1;
  }

  return { humanCount, aiCount, groundedCount };
}

/** Returns a copy of the document with counts stamped on every substate. */
export function withCounts(doc) {
  return {
    ...doc,
    states: doc.states.map((state) => ({
      ...state,
      substates: state.substates.map((substate) => ({
        ...substate,
        ...countsForSources(substate.sources ?? []),
      })),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/local-graphs/counts.test.mjs`
Expected: PASS — 4 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/lib/counts.mjs tests/local-graphs/counts.test.mjs
git commit -m "feat: compute provenance counts at local graph write time"
```

---

## Task 4: `sdd-graph write` — the CLI core and its shim

**Files:**
- Create: `skills/subagent-driven-development/scripts/lib/cli.mjs`
- Create: `skills/subagent-driven-development/scripts/sdd-graph`
- Test: `tests/local-graphs/cli.test.mjs`

The CLI's logic takes its I/O as a parameter — `run(argv, io)` returns an exit code instead of calling `process.exit`, and writes through `io.out` / `io.err` instead of touching `process.stdout`. That is what makes every case below an ordinary in-process function call.

- [ ] **Step 1: Write the failing test**

Create `tests/local-graphs/cli.test.mjs`:

```js
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { run } from "../../skills/subagent-driven-development/scripts/lib/cli.mjs";

/** Drives the CLI in-process against a temp store, capturing its streams. */
function invoke(root, argv, stdin = "") {
  const out = [];
  const err = [];
  const code = run(argv, {
    root,
    readStdin: () => stdin,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  });
  return { code, stdout: out.join(""), stderr: err.join("") };
}

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "sdd-graph-cli-"));
}

function doc(overrides = {}) {
  return JSON.stringify({
    spec: { path: "docs/specs/a-design.md", title: "A design" },
    trigger: { task: 1, reason: "task-complete" },
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
            notes: "A concern worth keeping local.",
            sources: [
              { marker: "1", source: "human", ref: null, text: "It must do the thing." },
              { marker: "2", source: "ai_assumption", ref: null, text: "Assumed default." },
            ],
          },
        ],
      },
    ],
    stateEdges: [],
    substateEdges: [],
    annotationCoverage: { mapped: 2, total: 3 },
    ...overrides,
  });
}

const SLUG = "a-design";

function graphsPath(root, ...parts) {
  return join(root, ".governed-superpowers", "graphs", ...parts);
}

test("write creates revision 0001, current.json and the index", () => {
  const root = tempRoot();
  const result = invoke(root, ["write", "docs/plans/a.md"], doc());
  assert.equal(result.code, 0, result.stderr);

  const revision = JSON.parse(readFileSync(graphsPath(root, SLUG, "revisions", "0001.json"), "utf8"));

  assert.equal(revision.formatVersion, 1);
  assert.equal(revision.revision, 1);
  assert.match(revision.builtAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(revision.spec.planPath, "docs/plans/a.md");
  assert.deepEqual(revision.trigger, { task: 1, reason: "task-complete" });
  assert.deepEqual(revision.publish, { sentAt: null, skippedReason: null, omittedFields: [] });

  const substate = revision.states[0].substates[0];
  assert.equal(substate.humanCount, 1);
  assert.equal(substate.aiCount, 1);
  assert.equal(substate.groundedCount, 0);
  assert.equal(substate.notes, "A concern worth keeping local.");

  assert.deepEqual(JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8")), revision);

  const index = JSON.parse(readFileSync(graphsPath(root, "index.json"), "utf8"));
  assert.equal(index.sheets.length, 1);
  assert.equal(index.sheets[0].slug, SLUG);
  assert.equal(index.sheets[0].currentRevision, 1);
  assert.equal(index.sheets[0].revisionCount, 1);
  assert.equal(index.sheets[0].specPath, "docs/specs/a-design.md");
});

test("a second write appends 0002 and leaves 0001 byte-for-byte untouched", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  const first = readFileSync(graphsPath(root, SLUG, "revisions", "0001.json"), "utf8");

  invoke(root, ["write", "docs/plans/a.md"], doc({ trigger: { task: 2, reason: "task-complete" } }));

  assert.deepEqual(readdirSync(graphsPath(root, SLUG, "revisions")).sort(), [
    "0001.json",
    "0002.json",
  ]);
  assert.equal(
    readFileSync(graphsPath(root, SLUG, "revisions", "0001.json"), "utf8"),
    first,
    "the earlier revision must be immutable"
  );
  assert.equal(JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8")).revision, 2);
});

test("invalid input exits nonzero, names the field, and writes nothing", () => {
  const root = tempRoot();
  const bad = JSON.parse(doc());
  bad.states[0].substates[0].title = "";

  const result = invoke(root, ["write", "docs/plans/a.md"], JSON.stringify(bad));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /states\[0\]\.substates\[0\]\.title/);
  assert.equal(existsSync(graphsPath(root)), false);
});

test("unparseable stdin exits nonzero without writing", () => {
  const root = tempRoot();
  const result = invoke(root, ["write", "docs/plans/a.md"], "{not json");

  assert.equal(result.code, 1);
  assert.match(result.stderr, /could not parse/i);
  assert.equal(existsSync(graphsPath(root)), false);
});

test("an unknown subcommand exits 2 with usage", () => {
  const result = invoke(tempRoot(), ["frobnicate"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: sdd-graph/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/cli.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/cli.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/subagent-driven-development/scripts/lib/cli.mjs`:

```js
/**
 * Local collaboration-graph store CLI.
 *
 *   sdd-graph write PLAN_FILE          < document.json
 *   sdd-graph payload SLUG
 *   sdd-graph record-publish SLUG --sent [--omitted a,b] | --skipped REASON
 *
 * `write` is unconditional: the local graph is built whether or not the human
 * partner has consented to publishing anything. Consent is read only by
 * `payload`, the single point where anything is prepared to leave the machine.
 *
 * run() takes its I/O as an argument and returns an exit code rather than
 * calling process.exit, so the whole surface is testable in-process. The
 * executable shim supplies the real streams.
 */
import { withCounts } from "./counts.mjs";
import {
  FORMAT_VERSION,
  nextRevisionNumber,
  readIndex,
  repoRoot,
  revisionPath,
  sheetDir,
  slugForSpec,
  upsertSheet,
  writeIndex,
  writeJsonAtomic,
} from "./store.mjs";
import { validateDocument } from "./validate.mjs";

export const USAGE = `usage: sdd-graph write PLAN_FILE < document.json
       sdd-graph payload SLUG
       sdd-graph record-publish SLUG --sent [--omitted a,b] | --skipped REASON`;

function commandWrite(args, io) {
  const planPath = args[0];
  if (!planPath) {
    io.err(`${USAGE}\n`);
    return 2;
  }

  let doc;
  try {
    doc = JSON.parse(io.readStdin());
  } catch (error) {
    io.err(`could not parse the document on stdin: ${error.message}\n`);
    return 1;
  }

  const check = validateDocument(doc);
  if (!check.ok) {
    io.err(`invalid document at ${check.path || "<root>"}: ${check.message}\n`);
    return 1;
  }

  const root = io.root ?? repoRoot();
  const slug = slugForSpec(doc.spec.path);
  const dir = sheetDir(root, slug);
  const revision = nextRevisionNumber(dir);

  const counted = withCounts(doc);
  const written = {
    formatVersion: FORMAT_VERSION,
    revision,
    builtAt: new Date().toISOString(),
    trigger: doc.trigger ?? null,
    spec: {
      path: doc.spec.path,
      title: doc.spec.title,
      planPath: doc.spec.planPath ?? planPath,
    },
    states: counted.states,
    stateEdges: doc.stateEdges ?? [],
    substateEdges: doc.substateEdges ?? [],
    annotationCoverage: doc.annotationCoverage ?? null,
    publish: { sentAt: null, skippedReason: null, omittedFields: [] },
  };

  writeJsonAtomic(revisionPath(dir, revision), written);
  writeJsonAtomic(`${dir}/current.json`, written);

  writeIndex(
    root,
    upsertSheet(readIndex(root), {
      slug,
      specPath: written.spec.path,
      title: written.spec.title,
      planPath: written.spec.planPath,
      currentRevision: revision,
      revisionCount: revision,
      updatedAt: written.builtAt,
      publish: written.publish,
    })
  );

  io.out(`wrote revision ${revision} for ${slug}\n`);
  return 0;
}

export function run(argv, io) {
  const [command, ...args] = argv;
  switch (command) {
    case "write":
      return commandWrite(args, io);
    default:
      io.err(`${USAGE}\n`);
      return 2;
  }
}
```

Create `skills/subagent-driven-development/scripts/sdd-graph`:

```js
#!/usr/bin/env node
// Thin shim: all logic lives in lib/cli.mjs, which takes its I/O as an
// argument so it can be tested without spawning a process.
import { readFileSync } from "node:fs";
import { run } from "./lib/cli.mjs";

process.exit(
  run(process.argv.slice(2), {
    readStdin: () => {
      try {
        return readFileSync(0, "utf8");
      } catch {
        return "";
      }
    },
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  })
);
```

- [ ] **Step 4: Make the shim executable and run the test**

```bash
chmod +x skills/subagent-driven-development/scripts/sdd-graph
node --test tests/local-graphs/cli.test.mjs
```

Expected: PASS — 5 tests, 0 failures

- [ ] **Step 5: Verify the shim works end to end**

```bash
mkdir -p /tmp/sdd-demo && cd /tmp/sdd-demo && git init -q
printf '%s' '{"spec":{"path":"docs/x-design.md","title":"X"},"states":[{"key":"s1","label":"L","substates":[{"key":"task-1","title":"T"}]}]}' \
  | "$OLDPWD/skills/subagent-driven-development/scripts/sdd-graph" write docs/plan.md
cat .governed-superpowers/graphs/x-design/current.json
cd "$OLDPWD"
```

Expected: `wrote revision 1 for x-design`, and the printed file shows `"formatVersion": 1` with zeroed counts.

- [ ] **Step 6: Commit**

```bash
git add skills/subagent-driven-development/scripts/sdd-graph skills/subagent-driven-development/scripts/lib/cli.mjs tests/local-graphs/cli.test.mjs
git commit -m "feat: add sdd-graph write, building a local graph revision per task"
```

---

## Task 5: Consent-scope filtering

**Files:**
- Create: `skills/subagent-driven-development/scripts/lib/scope.mjs`
- Test: `tests/local-graphs/scope.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/local-graphs/scope.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/scope.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/scope.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/subagent-driven-development/scripts/lib/scope.mjs`:

```js
/**
 * Consent-scope filtering: the single boundary between the full-fidelity local
 * revision and what is allowed to leave the machine.
 *
 * A declined flag means the field is omitted, never blanked - except where the
 * server's schema requires a non-empty string (spec.path, spec.title,
 * substates[].title). Those get content-free substitutes instead, chosen to be
 * stable across publishes so the portal's replace-contents-keep-the-tab-name
 * behaviour still works.
 */
import { createHash } from "node:crypto";

export function digestFor(specPath) {
  return createHash("sha256").update(specPath).digest("hex");
}

/** `task-3` -> `Task 3`; anything else -> `Task`, since blank is not allowed. */
function neutralTitle(key) {
  const match = /^task-(\d+)$/.exec(key);
  return match ? `Task ${match[1]}` : "Task";
}

export function applyScope(revision, consent) {
  const scope = consent.scope;
  const omittedFields = [];

  let spec;
  if (scope.specPaths) {
    spec = {
      path: revision.spec.path,
      title: revision.spec.title,
      planPath: revision.spec.planPath ?? null,
    };
  } else {
    const digest = digestFor(revision.spec.path);
    spec = {
      path: `opaque:${digest.slice(0, 16)}`,
      title: `Sheet ${digest.slice(0, 8)}`,
      planPath: null,
    };
    omittedFields.push("spec.path");
  }

  if (!scope.substateTitles) omittedFields.push("substates.title");
  if (!scope.changePaths) omittedFields.push("substates.changes");
  if (!scope.annotationText) omittedFields.push("sources.text");
  if (revision.states.some((state) => state.substates.some((substate) => substate.notes))) {
    omittedFields.push("substates.notes");
  }

  const states = revision.states.map((state, index) => {
    const out = {
      key: state.key,
      label: scope.substateTitles ? state.label : `Group ${index + 1}`,
      substates: state.substates.map((substate) => {
        const sub = {
          key: substate.key,
          title: scope.substateTitles ? substate.title : neutralTitle(substate.key),
        };
        if (substate.status) sub.status = substate.status;
        if (scope.changePaths && substate.changes?.length) sub.changes = substate.changes;
        if (substate.commits?.length) sub.commits = substate.commits;
        if (substate.sources?.length) {
          sub.sources = substate.sources.map((source) => {
            const filtered = { source: source.source };
            if (source.marker != null) filtered.marker = source.marker;
            if (source.ref != null) filtered.ref = source.ref;
            if (scope.annotationText && source.text != null) filtered.text = source.text;
            return filtered;
          });
        }
        return sub;
      }),
    };
    if (scope.substateTitles && state.summary) out.summary = state.summary;
    return out;
  });

  const payload = {
    consent,
    spec,
    states,
    stateEdges: revision.stateEdges ?? [],
    substateEdges: revision.substateEdges ?? [],
  };
  if (revision.annotationCoverage) payload.annotationCoverage = revision.annotationCoverage;

  return { payload, omittedFields };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/local-graphs/scope.test.mjs`
Expected: PASS — 6 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/lib/scope.mjs tests/local-graphs/scope.test.mjs
git commit -m "feat: filter the local graph by consent scope at the send boundary"
```

---

## Task 6: `sdd-graph payload` — consent read and payload emission

**Files:**
- Modify: `skills/subagent-driven-development/scripts/lib/cli.mjs`
- Test: `tests/local-graphs/cli.test.mjs` (append cases)

- [ ] **Step 1: Write the failing test**

Append to `tests/local-graphs/cli.test.mjs`, and add `mkdirSync` and `writeFileSync` to the existing `node:fs` import:

```js
/** Writes a sharing.json into the temp store's repo root. */
function grantConsent(root, overrides = {}) {
  const dir = join(root, ".governed-superpowers");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "sharing.json"),
    JSON.stringify({
      version: 1,
      project: { slug: "demo", name: "Demo", originHash: "sha256:abc" },
      scope: { specPaths: true, substateTitles: true, changePaths: true, annotationText: true },
      grantedAt: "2026-08-01T14:22:10Z",
      grantedBy: "human partner, in session",
      revokedAt: null,
      ...overrides,
    })
  );
}

test("payload prints the wire payload as parseable JSON on stdout", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  grantConsent(root);

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0, result.stderr);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.spec.path, "docs/specs/a-design.md");
  assert.equal(payload.consent.project.slug, "demo");
  assert.equal(payload.states[0].substates[0].title, "Do the thing");
  assert.equal(payload.states[0].substates[0].notes, undefined);
  assert.match(result.stderr, /omitted: substates\.notes/);
});

test("payload skips silently when there is no consent file", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: no \.governed-superpowers\/sharing\.json/);
});

test("payload skips when consent has been revoked", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  grantConsent(root, { revokedAt: "2026-08-02T09:00:00Z" });

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: sharing\.json revokedAt is set/);
});

test("payload for an unknown slug exits nonzero", () => {
  const root = tempRoot();
  grantConsent(root);

  const result = invoke(root, ["payload", "no-such-sheet"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no local graph for 'no-such-sheet'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/cli.test.mjs`
Expected: FAIL — the four new cases fail; `payload` falls through to the usage branch and returns 2

- [ ] **Step 3: Write minimal implementation**

In `skills/subagent-driven-development/scripts/lib/cli.mjs`, add these imports:

```js
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyScope } from "./scope.mjs";
```

and add `readJson` to the existing `./store.mjs` import list.

Add the command, above `run`:

```js
/**
 * Consent is read here and nowhere else, and re-read on every call - a
 * revocation mid-plan must stop the very next update, not the next plan. A
 * missing or revoked record is not an error: it prints one line and exits 0,
 * exactly like sdd-publish's old skip.
 */
function commandPayload(args, io) {
  const slug = args[0];
  if (!slug) {
    io.err(`${USAGE}\n`);
    return 2;
  }

  const root = io.root ?? repoRoot();
  const sharingPath = join(root, ".governed-superpowers", "sharing.json");

  if (!existsSync(sharingPath)) {
    io.out("skipped: no .governed-superpowers/sharing.json -- no active consent\n");
    return 0;
  }

  const consent = readJson(sharingPath);
  if (consent.revokedAt !== null && consent.revokedAt !== undefined) {
    io.out("skipped: sharing.json revokedAt is set -- consent revoked\n");
    return 0;
  }

  const currentPath = join(sheetDir(root, slug), "current.json");
  if (!existsSync(currentPath)) {
    io.err(`no local graph for '${slug}' -- run sdd-graph write first\n`);
    return 1;
  }

  const { payload, omittedFields } = applyScope(readJson(currentPath), consent);

  // The payload goes to stdout so it can be piped or read verbatim; the
  // human-facing summary goes to stderr so it never contaminates that JSON.
  io.out(`${JSON.stringify(payload, null, 2)}\n`);
  io.err(omittedFields.length ? `omitted: ${omittedFields.join(", ")}\n` : "omitted: nothing\n");
  return 0;
}
```

Add the dispatch case in `run`:

```js
    case "payload":
      return commandPayload(args, io);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/local-graphs/cli.test.mjs`
Expected: PASS — 9 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/lib/cli.mjs tests/local-graphs/cli.test.mjs
git commit -m "feat: add sdd-graph payload, the only consent-reading step"
```

---

## Task 7: `sdd-graph record-publish` and the shell wrapper

**Files:**
- Modify: `skills/subagent-driven-development/scripts/lib/cli.mjs`
- Create: `tests/local-graphs/test-local-graphs.sh`
- Test: `tests/local-graphs/cli.test.mjs` (append cases)

- [ ] **Step 1: Write the failing test**

Append to `tests/local-graphs/cli.test.mjs`:

```js
test("record-publish --sent stamps the current revision and the index", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());

  const result = invoke(root, [
    "record-publish",
    SLUG,
    "--sent",
    "--omitted",
    "substates.changes,sources.text",
  ]);
  assert.equal(result.code, 0, result.stderr);

  const current = JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"));
  const stored = JSON.parse(readFileSync(graphsPath(root, SLUG, "revisions", "0001.json"), "utf8"));

  assert.match(current.publish.sentAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(current.publish.skippedReason, null);
  assert.deepEqual(current.publish.omittedFields, ["substates.changes", "sources.text"]);
  assert.deepEqual(stored.publish, current.publish, "the revision file is stamped too");

  const index = JSON.parse(readFileSync(graphsPath(root, "index.json"), "utf8"));
  assert.deepEqual(index.sheets[0].publish, current.publish);
});

test("record-publish --skipped records the reason and no send time", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());

  assert.equal(invoke(root, ["record-publish", SLUG, "--skipped", "no-consent"]).code, 0);

  const current = JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"));
  assert.equal(current.publish.sentAt, null);
  assert.equal(current.publish.skippedReason, "no-consent");
  assert.deepEqual(current.publish.omittedFields, []);
});

test("record-publish without --sent or --skipped exits 2", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());

  const result = invoke(root, ["record-publish", SLUG]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: sdd-graph/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-graphs/cli.test.mjs`
Expected: FAIL — the first two new cases fail; `record-publish` hits the usage branch and returns 2

- [ ] **Step 3: Write minimal implementation**

In `skills/subagent-driven-development/scripts/lib/cli.mjs`, add above `run`:

```js
/**
 * The one field on a revision that is written after the fact. Everything else
 * is immutable once built, so "what left this machine, and when" can be
 * answered from disk without asking the server.
 */
function commandRecordPublish(args, io) {
  const slug = args[0];
  const sent = args.includes("--sent");
  const skippedAt = args.indexOf("--skipped");

  if (!slug || sent === (skippedAt !== -1)) {
    io.err(`${USAGE}\n`);
    return 2;
  }

  const omittedAt = args.indexOf("--omitted");
  const omittedFields =
    omittedAt === -1 || !args[omittedAt + 1]
      ? []
      : args[omittedAt + 1]
          .split(",")
          .map((field) => field.trim())
          .filter(Boolean);

  const publish = sent
    ? { sentAt: new Date().toISOString(), skippedReason: null, omittedFields }
    : { sentAt: null, skippedReason: args[skippedAt + 1] ?? "unknown", omittedFields: [] };

  const root = io.root ?? repoRoot();
  const dir = sheetDir(root, slug);
  const currentPath = join(dir, "current.json");
  if (!existsSync(currentPath)) {
    io.err(`no local graph for '${slug}' -- run sdd-graph write first\n`);
    return 1;
  }

  const current = { ...readJson(currentPath), publish };
  writeJsonAtomic(currentPath, current);
  writeJsonAtomic(revisionPath(dir, current.revision), current);

  const index = readIndex(root);
  const entry = index.sheets.find((sheet) => sheet.slug === slug);
  if (entry) writeIndex(root, upsertSheet(index, { ...entry, publish }));

  io.out(
    sent
      ? `recorded publish of ${slug} revision ${current.revision}\n`
      : `recorded skip: ${publish.skippedReason}\n`
  );
  return 0;
}
```

Add the dispatch case in `run`:

```js
    case "record-publish":
      return commandRecordPublish(args, io);
```

- [ ] **Step 4: Add the shell wrapper**

Create `tests/local-graphs/test-local-graphs.sh`:

```bash
#!/usr/bin/env bash
# Runs the local collaboration-graph store's unit and CLI tests. The suite
# itself uses Node's built-in test runner - no dependencies, matching the CLI
# it exercises. This wrapper exists so the suite is discoverable alongside the
# repo's other tests/**/test-*.sh entry points.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

exec node --test "$SCRIPT_DIR"
```

Then:

```bash
chmod +x tests/local-graphs/test-local-graphs.sh
```

- [ ] **Step 5: Run the whole suite to verify it passes**

Run: `tests/local-graphs/test-local-graphs.sh`
Expected: PASS — 12 CLI tests plus the store, validate, counts and scope suites, 0 failures

- [ ] **Step 6: Commit**

```bash
git add skills/subagent-driven-development/scripts/lib/cli.mjs tests/local-graphs/cli.test.mjs tests/local-graphs/test-local-graphs.sh
git commit -m "feat: record publish outcomes onto the local graph revision"
```

---

## Task 8: Unblock `sdd-publish` so the local build is unconditional

**Files:**
- Modify: `skills/subagent-driven-development/scripts/sdd-publish:9-13,27-39`
- Test: `tests/local-graphs/test-sdd-publish.sh`

Today `sdd-publish` exits before bundling anything when consent is missing. The local build now needs that bundle regardless, and consent has moved to `sdd-graph payload`.

- [ ] **Step 1: Write the failing test**

Create `tests/local-graphs/test-sdd-publish.sh`, following the style of `tests/systematic-debugging/test-find-polluter.sh`:

```bash
#!/usr/bin/env bash
# sdd-publish must bundle regardless of consent: the local graph build depends
# on its output, and consent now lives in `sdd-graph payload`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT_UNDER_TEST="$REPO_ROOT/skills/subagent-driven-development/scripts/sdd-publish"

FAILURES=0
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

pass() {
  echo "  [PASS] $1"
}

fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

assert_contains() {
  if printf '%s' "$1" | grep -Fq -- "$2"; then
    pass "$3"
  else
    fail "$3 (expected output to contain: $2)"
  fi
}

assert_not_contains() {
  if printf '%s' "$1" | grep -Fq -- "$2"; then
    fail "$3 (expected output NOT to contain: $2)"
  else
    pass "$3"
  fi
}

# A throwaway repo with one plan referencing one spec, and one commit.
setup_project() {
  PROJECT="$TEST_ROOT/project"
  rm -rf "$PROJECT"
  mkdir -p "$PROJECT/docs"
  (
    cd "$PROJECT"
    git init -q
    git config user.email "test@example.com"
    git config user.name "Test"
    printf '# Plan\n\n**Reference spec:** `docs/a-design.md`\n' > docs/plan.md
    git add .
    git commit -qm "initial"
  )
}

run_publish() {
  (cd "$PROJECT" && "$SCRIPT_UNDER_TEST" docs/plan.md 2>&1)
}

write_sharing() {
  mkdir -p "$PROJECT/.governed-superpowers"
  printf '{"revokedAt": %s}\n' "$1" > "$PROJECT/.governed-superpowers/sharing.json"
}

echo "sdd-publish bundles regardless of consent"

setup_project
OUTPUT="$(run_publish)"
assert_contains "$OUTPUT" "# Publish bundle: plan.md" "bundles with no consent file at all"
assert_not_contains "$OUTPUT" "skipped:" "does not skip with no consent file"
assert_contains "$OUTPUT" "docs/a-design.annotations.json (does not exist)" "reports the sidecar's absence"
assert_contains "$OUTPUT" "# 0 completed task(s) bundled" "reports an empty ledger honestly"

setup_project
write_sharing "null"
assert_contains "$(run_publish)" "# Publish bundle: plan.md" "bundles with unrevoked consent"

setup_project
write_sharing '"2026-08-02T09:00:00Z"'
OUTPUT="$(run_publish)"
assert_contains "$OUTPUT" "# Publish bundle: plan.md" "bundles even when consent is revoked"
assert_not_contains "$OUTPUT" "skipped:" "does not skip when consent is revoked"

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "all passed"
```

Then:

```bash
chmod +x tests/local-graphs/test-sdd-publish.sh
```

- [ ] **Step 2: Run test to verify it fails**

Run: `tests/local-graphs/test-sdd-publish.sh`
Expected: FAIL — the no-consent and revoked cases fail; output is `skipped: no .governed-superpowers/sharing.json -- no active consent`

- [ ] **Step 3: Write minimal implementation**

In `skills/subagent-driven-development/scripts/sdd-publish`, delete these lines:

```bash
sharing="$root/.governed-superpowers/sharing.json"

if [ ! -f "$sharing" ]; then
  echo "skipped: no .governed-superpowers/sharing.json -- no active consent"
  exit 0
fi

revoked=$(grep -o '"revokedAt"[[:space:]]*:[[:space:]]*[^,}]*' "$sharing" \
  | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '[:space:]' || true)
if [ "$revoked" != "null" ]; then
  echo "skipped: sharing.json revokedAt is set -- consent revoked"
  exit 0
fi
```

Replace the header comment paragraph describing the consent re-check (lines 9-13) with:

```bash
# This script no longer reads consent at all. The bundle it prints feeds the
# unconditional local graph build (`sdd-graph write`), which happens whether or
# not anything is ever published. Consent is read once, later, by
# `sdd-graph payload` -- the single step that prepares data to leave the
# machine, and which re-reads sharing.json on every call.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `tests/local-graphs/test-sdd-publish.sh`
Expected: PASS — 7 assertions, `all passed`

- [ ] **Step 5: Verify the shell lint still passes**

Run: `scripts/lint-shell.sh`
Expected: exit 0, no findings for `sdd-publish` or the new test

- [ ] **Step 6: Commit**

```bash
git add skills/subagent-driven-development/scripts/sdd-publish tests/local-graphs/test-sdd-publish.sh
git commit -m "fix: bundle unconditionally so the local graph builds without consent"
```

---

## Task 9: Viewer scaffold, copied pure modules, and the drift guard

**Files:**
- Create: `viewer/package.json`, `viewer/tsconfig.json`, `viewer/next.config.ts`, `viewer/postcss.config.mjs`, `viewer/next-env.d.ts`, `viewer/.gitignore`
- Create: `viewer/src/lib/graph-color.ts`, `viewer/src/lib/graph-layout.ts` (copies)
- Create: `viewer/src/app/layout.tsx`, `viewer/src/app/globals.css`, `viewer/src/app/api/healthz/route.ts`, `viewer/public/theme.js`
- Test: `viewer/test/drift-guard.test.ts`

- [ ] **Step 1: Create the app skeleton**

```bash
mkdir -p viewer/src/lib viewer/src/app/api/healthz viewer/public viewer/test
cp web/src/lib/graph-color.ts viewer/src/lib/graph-color.ts
cp web/src/lib/graph-layout.ts viewer/src/lib/graph-layout.ts
cp web/src/app/globals.css viewer/src/app/globals.css
cp web/public/theme.js viewer/public/theme.js
cp web/postcss.config.mjs viewer/postcss.config.mjs
cp web/next-env.d.ts viewer/next-env.d.ts
```

Create `viewer/package.json`:

```json
{
  "name": "governed-superpowers-viewer",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "tsc --noEmit",
    "test": "tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@xyflow/react": "^12.11.2",
    "next": "^15.1.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.10.7",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3"
  }
}
```

Create `viewer/tsconfig.json` — identical to `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `viewer/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same standalone output as the portal, so the runtime Docker stage needs
  // neither node_modules nor the Next CLI.
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
```

Create `viewer/.gitignore`:

```
node_modules
.next
*.tsbuildinfo
```

- [ ] **Step 2: Write the failing drift-guard test**

Create `viewer/test/drift-guard.test.ts`:

```ts
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
```

- [ ] **Step 3: Add the app shell and healthcheck**

Create `viewer/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Collaboration graphs · local",
  description: "Local viewer for collaboration graphs built during subagent-driven development.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Static file, loaded synchronously so the stored theme applies
            before first paint. Copied from web/public/theme.js. */}
        <script src="/theme.js" />
      </head>
      <body>
        <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
```

Create `viewer/src/app/api/healthz/route.ts`:

```ts
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Install and run the test to verify it passes**

Run: `cd viewer && npm install && npm test`
Expected: PASS — 2 tests, 0 failures

- [ ] **Step 5: Verify the app type-checks**

Run: `cd viewer && npm run lint`
Expected: exit 0, no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add viewer/
git commit -m "feat: scaffold the local graph viewer with a drift guard on copied modules"
```

---

## Task 10: Viewer graph store — filesystem to `GraphPayload`

**Files:**
- Create: `viewer/src/app/graphs/types.ts`
- Create: `viewer/src/lib/graph-store.ts`
- Test: `viewer/test/graph-store.test.ts`

- [ ] **Step 1: Write the types**

Create `viewer/src/app/graphs/types.ts`:

```ts
import type { LayoutEdge, LayoutState } from "@/lib/graph-layout";

export type PublishRecord = {
  sentAt: string | null;
  skippedReason: string | null;
  omittedFields: string[];
};

export type SheetSummary = {
  slug: string;
  title: string;
  specPath: string;
  planPath: string | null;
  currentRevision: number;
  revisionCount: number;
  updatedAt: string;
  publish: PublishRecord;
};

export type GraphSource = {
  marker: string | null;
  source: string;
  ref: string | null;
  text: string | null;
};

export type SubstateDetail = {
  id: string;
  label: string;
  title: string;
  status: string | null;
  notes: string | null;
  commits: string[];
  changes: { path: string; summary: string }[];
  sources: GraphSource[];
  stateLabel: string;
  humanCount: number;
  aiCount: number;
  groundedCount: number;
};

export type GraphPayload = {
  states: LayoutState[];
  stateEdges: LayoutEdge[];
  substateEdges: LayoutEdge[];
  /** Keyed by substate id - what the drawer renders on click. */
  details: Record<string, SubstateDetail>;
};

export type LoadedRevision = {
  slug: string;
  title: string;
  specPath: string;
  planPath: string | null;
  revision: number;
  revisions: number[];
  builtAt: string;
  trigger: { task: number | null; reason: string } | null;
  annotationCoverage: { mapped: number; total: number } | null;
  publish: PublishRecord;
  graph: GraphPayload;
};

/** A sheet that exists on disk but cannot be rendered, and why. */
export type SheetError = { slug: string; file: string; message: string };
```

- [ ] **Step 2: Write the failing test**

Create `viewer/test/graph-store.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd viewer && npm test`
Expected: FAIL — `Cannot find module '../src/lib/graph-store'`

- [ ] **Step 4: Write minimal implementation**

Create `viewer/src/lib/graph-store.ts`:

```ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  GraphPayload,
  LoadedRevision,
  PublishRecord,
  SheetError,
  SheetSummary,
  SubstateDetail,
} from "@/app/graphs/types";

/** The only revision format this viewer knows how to render. */
export const SUPPORTED_FORMAT_VERSION = 1;

function graphDir(): string {
  return process.env.GRAPH_DIR ?? "/graphs";
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/**
 * Reads only index.json - the sheet list must stay cheap, and must not depend
 * on every revision on disk being well-formed.
 */
export async function listSheets(): Promise<SheetSummary[]> {
  try {
    const index = (await readJson(join(graphDir(), "index.json"))) as { sheets?: SheetSummary[] };
    return index.sheets ?? [];
  } catch {
    return [];
  }
}

async function listRevisionNumbers(sheetDir: string): Promise<number[]> {
  try {
    const files = await readdir(join(sheetDir, "revisions"));
    return files
      .filter((file) => /^\d{4}\.json$/.test(file))
      .map((file) => Number(file.slice(0, 4)))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

type RawSource = {
  marker?: string | null;
  source: string;
  ref?: string | null;
  text?: string | null;
};

type RawSubstate = {
  key: string;
  title: string;
  status?: string | null;
  notes?: string | null;
  commits?: string[];
  changes?: { path: string; summary: string }[];
  sources?: RawSource[];
  humanCount?: number;
  aiCount?: number;
  groundedCount?: number;
};

type RawState = { key: string; label: string; summary?: string | null; substates: RawSubstate[] };

type RawRevision = {
  formatVersion: number;
  revision: number;
  builtAt: string;
  trigger?: { task: number | null; reason: string } | null;
  spec: { path: string; title: string; planPath?: string | null };
  states: RawState[];
  stateEdges?: { from: string; to: string }[];
  substateEdges?: { from: string; to: string }[];
  annotationCoverage?: { mapped: number; total: number } | null;
  publish?: PublishRecord;
};

/** Ids are synthesised from keys; there are no database rows to borrow them from. */
function stateId(key: string): string {
  return `state-${key}`;
}

function substateId(stateKey: string, key: string): string {
  return `sub-${stateKey}-${key}`;
}

function toPayload(raw: RawRevision): GraphPayload {
  const details: Record<string, SubstateDetail> = {};

  const states = raw.states.map((state) => ({
    id: stateId(state.key),
    key: state.key,
    label: state.label,
    summary: state.summary ?? null,
    substates: state.substates.map((substate) => {
      const id = substateId(state.key, substate.key);
      const counts = {
        humanCount: substate.humanCount ?? 0,
        aiCount: substate.aiCount ?? 0,
        groundedCount: substate.groundedCount ?? 0,
      };

      details[id] = {
        id,
        label: substate.key,
        title: substate.title,
        status: substate.status ?? null,
        notes: substate.notes ?? null,
        commits: substate.commits ?? [],
        changes: substate.changes ?? [],
        sources: (substate.sources ?? []).map((source) => ({
          marker: source.marker ?? null,
          source: source.source,
          ref: source.ref ?? null,
          text: source.text ?? null,
        })),
        stateLabel: state.label,
        ...counts,
      };

      return {
        id,
        key: substate.key,
        label: substate.key,
        title: substate.title,
        status: substate.status ?? null,
        ...counts,
      };
    }),
  }));

  const stateEdges = (raw.stateEdges ?? []).map((edge) => ({
    fromId: stateId(edge.from),
    toId: stateId(edge.to),
  }));

  // Substate edge endpoints arrive as "<stateKey>/<substateKey>", the same
  // form publish_graph accepts.
  const substateEdges = (raw.substateEdges ?? []).map((edge) => {
    const [fromState, fromSub] = edge.from.split("/");
    const [toState, toSub] = edge.to.split("/");
    return { fromId: substateId(fromState, fromSub), toId: substateId(toState, toSub) };
  });

  return { states, stateEdges, substateEdges, details };
}

/**
 * Loads one revision of one sheet.
 *
 * Returns `null` when the sheet does not exist, a SheetError when it exists
 * but cannot be rendered, and the mapped revision otherwise. Errors are values
 * rather than exceptions so one corrupt file degrades to an error card instead
 * of a 500 for the whole page.
 */
export async function loadRevision(
  slug: string,
  requested?: number
): Promise<LoadedRevision | SheetError | null> {
  const sheetDir = join(graphDir(), slug);
  const revisions = await listRevisionNumbers(sheetDir);

  const wanted = requested && revisions.includes(requested) ? requested : null;
  const file = wanted
    ? join(sheetDir, "revisions", `${String(wanted).padStart(4, "0")}.json`)
    : join(sheetDir, "current.json");

  let raw: RawRevision;
  try {
    raw = (await readJson(file)) as RawRevision;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) return null;
    return { slug, file, message: `could not read this revision: ${message}` };
  }

  if (raw.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    return {
      slug,
      file,
      message: `this revision declares formatVersion ${raw.formatVersion}; this viewer only renders version ${SUPPORTED_FORMAT_VERSION}`,
    };
  }

  return {
    slug,
    title: raw.spec.title,
    specPath: raw.spec.path,
    planPath: raw.spec.planPath ?? null,
    revision: raw.revision,
    revisions: revisions.length ? revisions : [raw.revision],
    builtAt: raw.builtAt,
    trigger: raw.trigger ?? null,
    annotationCoverage: raw.annotationCoverage ?? null,
    publish: raw.publish ?? { sentAt: null, skippedReason: null, omittedFields: [] },
    graph: toPayload(raw),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd viewer && npm test`
Expected: PASS — 10 tests (8 store + 2 drift guard), 0 failures

- [ ] **Step 6: Commit**

```bash
git add viewer/src/lib/graph-store.ts viewer/src/app/graphs/types.ts viewer/test/graph-store.test.ts
git commit -m "feat: read local graph revisions from the filesystem in the viewer"
```

---

## Task 11: Viewer canvas components and the sheet list page

**Files:**
- Create: `viewer/src/app/graphs/graph-canvas.tsx`, `viewer/src/app/graphs/substate-drawer.tsx`, `viewer/src/app/graphs/nodes/state-node.tsx`, `viewer/src/app/graphs/nodes/substate-node.tsx` (copies)
- Create: `viewer/src/app/page.tsx`

- [ ] **Step 1: Copy the canvas components verbatim**

```bash
mkdir -p viewer/src/app/graphs/nodes
cp "web/src/app/(app)/graphs/graph-canvas.tsx" viewer/src/app/graphs/graph-canvas.tsx
cp "web/src/app/(app)/graphs/substate-drawer.tsx" viewer/src/app/graphs/substate-drawer.tsx
cp "web/src/app/(app)/graphs/nodes/state-node.tsx" viewer/src/app/graphs/nodes/state-node.tsx
cp "web/src/app/(app)/graphs/nodes/substate-node.tsx" viewer/src/app/graphs/nodes/substate-node.tsx
```

These import only `@/lib/graph-layout`, `@/lib/graph-color`, `./types` and `@xyflow/react`, all of which resolve identically in the viewer, so no edits are needed. `sheet-tabs.tsx` and `graph-workspace.tsx` are deliberately **not** copied: they call the portal's rename/delete server actions and its project picker, neither of which exists in a read-only single-project viewer.

- [ ] **Step 2: Verify the copies type-check**

Run: `cd viewer && npm run lint`
Expected: exit 0. If a copied component uses a field missing from `viewer/src/app/graphs/types.ts`, add the field to `types.ts` — do not edit the copied component.

- [ ] **Step 3: Write the sheet list page**

Create `viewer/src/app/page.tsx`:

```tsx
import Link from "next/link";
import { listSheets } from "@/lib/graph-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sheets = await listSheets();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="label">Local</p>
        <h1
          className="mt-2 text-[clamp(1.9rem,4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.03em]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Collaboration graphs
        </h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
          Built on this machine after every completed task, whether or not anything was ever
          published. Colour shows where each chunk of work came from — what you asked for, or what
          the agent assumed.
        </p>
      </section>

      {sheets.length === 0 ? (
        <p
          className="rounded-2xl border p-6 text-[13px] leading-relaxed"
          style={{ borderColor: "var(--ink-faint)", color: "var(--ink-dim)" }}
        >
          No graphs yet. One appears here after the first task of a plan completes under
          subagent-driven development. If you expected graphs, check that the container&rsquo;s
          <code> /graphs </code> mount points at your project&rsquo;s
          <code> .governed-superpowers/graphs </code> directory.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sheets.map((sheet) => (
            <li key={sheet.slug}>
              <Link
                href={`/sheet/${sheet.slug}`}
                className="flex flex-col gap-1 rounded-2xl border p-5"
                style={{ borderColor: "var(--ink-faint)" }}
              >
                <span className="text-[15px] font-semibold">{sheet.title}</span>
                <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                  {sheet.specPath}
                </span>
                <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                  {sheet.revisionCount} revision{sheet.revisionCount === 1 ? "" : "s"} · updated{" "}
                  {new Date(sheet.updatedAt).toLocaleString()} ·{" "}
                  {sheet.publish.sentAt ? "published" : "never published"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify it builds**

Run: `cd viewer && npm run lint && npm run build`
Expected: both exit 0; the build lists `/` and `/api/healthz` as routes

- [ ] **Step 5: Commit**

```bash
git add viewer/src/app/graphs viewer/src/app/page.tsx
git commit -m "feat: render the local sheet list and copy the portal canvas components"
```

---

## Task 12: Sheet view — canvas, revision scrubber, publish banner

**Files:**
- Create: `viewer/src/app/sheet/[slug]/publish-banner.tsx`, `viewer/src/app/sheet/[slug]/revision-scrubber.tsx`, `viewer/src/app/sheet/[slug]/sheet-view.tsx`, `viewer/src/app/sheet/[slug]/page.tsx`

- [ ] **Step 1: Write the publish banner**

Create `viewer/src/app/sheet/[slug]/publish-banner.tsx`:

```tsx
import type { PublishRecord } from "@/app/graphs/types";

/** Field names as they appear in omittedFields, in plain English. */
const FIELD_LABELS: Record<string, string> = {
  "spec.path": "the spec's path",
  "substates.title": "task titles",
  "substates.changes": "changed files",
  "substates.notes": "task notes",
  "sources.text": "requirement text",
};

/**
 * What left the machine for this exact revision, read from the revision itself
 * rather than from the server. A revision that was never sent says so - the
 * normal case when no consent was ever granted, not an error.
 */
export function PublishBanner({
  publish,
  coverage,
}: {
  publish: PublishRecord;
  coverage: { mapped: number; total: number } | null;
}) {
  const omitted = publish.omittedFields.map((field) => FIELD_LABELS[field] ?? field);

  return (
    <div
      className="flex flex-col gap-1 rounded-xl border px-4 py-3 text-[12px]"
      style={{ borderColor: "var(--ink-faint)", color: "var(--ink-dim)" }}
    >
      <span>
        {publish.sentAt ? (
          <>
            <strong>Published</strong> {new Date(publish.sentAt).toLocaleString()}
            {omitted.length > 0 ? ` · omitted ${omitted.join(", ")}` : " · full payload"}
          </>
        ) : (
          <>
            <strong>Never published</strong>
            {publish.skippedReason ? ` · ${publish.skippedReason}` : ""}
          </>
        )}
      </span>
      <span>
        {coverage
          ? `Provenance coverage: ${coverage.mapped} of ${coverage.total} annotations matched a task${
              coverage.mapped < coverage.total
                ? " (unmatched ones were dropped, not reassigned)"
                : ""
            }`
          : "No annotations sidecar was found for this spec."}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write the revision scrubber**

Create `viewer/src/app/sheet/[slug]/revision-scrubber.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

/**
 * Steps through the revisions of one sheet. Navigation rather than local
 * state: each revision is a distinct URL, so a particular point in a plan's
 * history can be linked to and reloaded.
 */
export function RevisionScrubber({
  slug,
  revisions,
  current,
  builtAt,
}: {
  slug: string;
  revisions: number[];
  current: number;
  builtAt: string;
}) {
  const router = useRouter();
  const index = revisions.indexOf(current);
  const go = (revision: number) => router.push(`/sheet/${slug}?rev=${revision}`);

  return (
    <div
      className="flex flex-wrap items-center gap-3 text-[12px]"
      style={{ color: "var(--ink-dim)" }}
    >
      <button
        type="button"
        className="rounded-lg border px-2 py-1 disabled:opacity-40"
        style={{ borderColor: "var(--ink-faint)" }}
        disabled={index <= 0}
        onClick={() => go(revisions[index - 1])}
      >
        ← Earlier
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(revisions.length - 1, 0)}
        value={index < 0 ? revisions.length - 1 : index}
        onChange={(event) => go(revisions[Number(event.target.value)])}
        aria-label="Revision"
        className="w-48"
      />

      <button
        type="button"
        className="rounded-lg border px-2 py-1 disabled:opacity-40"
        style={{ borderColor: "var(--ink-faint)" }}
        disabled={index === -1 || index >= revisions.length - 1}
        onClick={() => go(revisions[index + 1])}
      >
        Later →
      </button>

      <span>
        Revision {current} of {revisions.length} · built {new Date(builtAt).toLocaleString()}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Write the client shell**

Create `viewer/src/app/sheet/[slug]/sheet-view.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { SubstateDrawer } from "@/app/graphs/substate-drawer";
import type { GraphPayload } from "@/app/graphs/types";

// React Flow measures the DOM on mount, so it cannot be server-rendered.
const GraphCanvas = dynamic(() => import("@/app/graphs/graph-canvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-[560px] place-items-center text-[13px]"
      style={{ color: "var(--ink-dim)" }}
    >
      Loading canvas…
    </div>
  ),
});

export function SheetView({ graph }: { graph: GraphPayload }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? graph.details[selectedId] ?? null : null;

  return (
    <>
      <div
        className="h-[560px] overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--ink-faint)" }}
      >
        <GraphCanvas graph={graph} onSelectSubstate={setSelectedId} />
      </div>
      <SubstateDrawer detail={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
```

These prop names match the copied components as they stand today — `GraphCanvas({ graph, onSelectSubstate })` and `SubstateDrawer({ detail, onClose })`. If a future copy differs, match the component rather than editing it.

- [ ] **Step 4: Write the sheet page**

Create `viewer/src/app/sheet/[slug]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRevision } from "@/lib/graph-store";
import { PublishBanner } from "./publish-banner";
import { RevisionScrubber } from "./revision-scrubber";
import { SheetView } from "./sheet-view";

export const dynamic = "force-dynamic";

export default async function SheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const { slug } = await params;
  const { rev } = await searchParams;

  const requested = rev ? Number(rev) : Number.NaN;
  const loaded = await loadRevision(slug, Number.isFinite(requested) ? requested : undefined);

  if (loaded === null) notFound();

  if ("message" in loaded) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/" className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
          ← All sheets
        </Link>
        <div
          className="rounded-2xl border p-6 text-[13px] leading-relaxed"
          style={{ borderColor: "var(--prov-ai)", color: "var(--ink-dim)" }}
        >
          <p className="font-semibold">This revision could not be rendered.</p>
          <p className="mt-2">{loaded.message}</p>
          <p className="mt-2">
            File: <code>{loaded.file}</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/" className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
        ← All sheets
      </Link>

      <div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">{loaded.title}</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--ink-dim)" }}>
          {loaded.specPath}
          {loaded.trigger?.task ? ` · built after task ${loaded.trigger.task}` : ""}
        </p>
      </div>

      <RevisionScrubber
        slug={loaded.slug}
        revisions={loaded.revisions}
        current={loaded.revision}
        builtAt={loaded.builtAt}
      />

      <PublishBanner publish={loaded.publish} coverage={loaded.annotationCoverage} />

      <SheetView graph={loaded.graph} />
    </div>
  );
}
```

- [ ] **Step 5: Verify it builds and serves a real store**

Run: `cd viewer && npm run lint && npm run build`
Expected: both exit 0; the build lists `/sheet/[slug]` as a dynamic route.

Then, from the repo root:

```bash
GRAPH_DIR="$(pwd)/.governed-superpowers/graphs" npm --prefix viewer run dev
```

Expected: `http://localhost:3000` lists any sheets present, or the empty state if no plan has completed a task yet. Clicking a sheet renders the canvas, the scrubber moves between revisions, and clicking a circle opens the detail drawer.

- [ ] **Step 6: Commit**

```bash
git add viewer/src/app/sheet
git commit -m "feat: add the sheet view with revision replay and publish banner"
```

---

## Task 13: Docker image and compose file

**Files:**
- Create: `viewer/Dockerfile`, `docker-compose.viewer.yml`
- Modify: `README.md`

- [ ] **Step 1: Write the Dockerfile**

Create `viewer/Dockerfile`:

```dockerfile
# Build context is ./viewer - this image needs nothing from the repo root.
#
# Deliberately simpler than web/Dockerfile: no Prisma stages and no OpenSSL
# package, because the viewer has no database. It reads a read-only mount.

FROM node:22-alpine AS deps
# Silences the "New major version of npm available" nag on every npm ci.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV GRAPH_DIR=/graphs
WORKDIR /app

# `output: "standalone"` emits server.js plus the minimal node_modules it
# needs, but not public/ or .next/static - those must be copied explicitly or
# every asset 404s.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server.js"]
```

- [ ] **Step 2: Write the compose file**

Create `docker-compose.viewer.yml`:

```yaml
# Local collaboration-graph viewer. Deliberately a separate file from
# docker-compose.yml, not a profile inside it: starting the viewer must never
# be able to start Postgres, the MCP server or Caddy.
#
#   docker compose -f docker-compose.viewer.yml up --build
#   open http://localhost:3100
#
# Point it at another repository by setting GRAPH_DIR to that repo's
# .governed-superpowers/graphs directory. Two repositories at once means two
# containers - give the second one a different VIEWER_PORT.
services:
  graph-viewer:
    build:
      context: ./viewer
      dockerfile: Dockerfile
    restart: unless-stopped
    # Loopback only. These graphs are unauthenticated local data and carry the
    # full-fidelity requirement text, including whatever was never consented
    # to be published.
    ports:
      - "127.0.0.1:${VIEWER_PORT:-3100}:3000"
    # Read-only: the viewer never writes, and a bug in it must not be able to
    # corrupt the store the publish path reads from.
    volumes:
      - ${GRAPH_DIR:-./.governed-superpowers/graphs}:/graphs:ro
    environment:
      - GRAPH_DIR=/graphs
      - PORT=3000
```

- [ ] **Step 3: Verify the container serves the store**

```bash
docker compose -f docker-compose.viewer.yml up --build -d
curl -fsS http://127.0.0.1:3100/api/healthz
```

Expected: `{"ok":true}`. Open `http://localhost:3100` and confirm the sheet list renders (or the empty state, if no plan has completed a task yet). Then:

```bash
docker compose -f docker-compose.viewer.yml down
```

- [ ] **Step 4: Document it in the README**

Add to `README.md`, after the existing Docker/self-hosting section:

````markdown
### Viewing collaboration graphs locally

Every plan run under `subagent-driven-development` writes its collaboration
graph to `.governed-superpowers/graphs/` after each completed task, whether or
not you publish anything. To look at it:

```bash
docker compose -f docker-compose.viewer.yml up --build
# then open http://localhost:3100
```

The viewer is read-only, binds to loopback, and needs no database, account or
network access. It shows every revision of every sheet, so you can step through
how a plan's graph grew and see — per revision — exactly what was published and
which fields were withheld. To view another project's graphs, set `GRAPH_DIR`
to that repository's `.governed-superpowers/graphs` directory.
````

- [ ] **Step 5: Commit**

```bash
git add viewer/Dockerfile docker-compose.viewer.yml README.md
git commit -m "feat: run the local graph viewer from its own compose file"
```

---

## Task 14: Skill and documentation updates

**Files:**
- Modify: `skills/subagent-driven-development/publishing-graphs.md`
- Modify: `skills/subagent-driven-development/SKILL.md`
- Modify: `docs/governed-superpowers/how-governed-superpowers-works.md`

This task changes behaviour-shaping skill content. Per `CLAUDE.md`, do not treat it as a documentation edit: the rewritten consent ask and build step need adversarial pressure testing across multiple sessions before this ships upstream, and that evidence belongs in the PR.

- [ ] **Step 1: Rewrite the consent section of `publishing-graphs.md`**

Replace the "Consent comes first" heading and its opening (through the verbatim ask) with:

````markdown
## The graph is built either way

After every `Task <N>: complete` ledger line, the graph is built to
`.governed-superpowers/graphs/` — no consent needed, nothing leaves the
machine. Your human partner can look at it any time with
`docker compose -f docker-compose.viewer.yml up`.

Consent governs one thing only: whether that local artifact is also sent to
the account portal.

## Consent, for publishing only

This check happens at Setup, and again on every `sdd-graph payload` call — a
mid-plan revocation must stop the very next update, not just the next plan.

Read `.governed-superpowers/sharing.json` from the project root. If it is
missing, or its `revokedAt` is not null, **stop and ask** before publishing
anything:

> I'm building this plan's collaboration graph locally as it goes — a diagram
> of what's getting built and which parts trace back to your input versus my
> own assumptions. That stays on your machine either way, and you can view it
> in a browser whenever you want. I can also publish it to your
> Governed-Superpowers account, updating after every completed task. That
> would send: the spec's path, the task titles from this plan, the files each
> task changed, and the requirement text from the spec's annotations sidecar.
> Want me to publish it too?
````

- [ ] **Step 2: Rewrite the assembly section of `publishing-graphs.md`**

Replace the numbered steps 1-5 under "Assembling the payload" with:

````markdown
Run this after every `Task <N>: complete` ledger line (clean or
parked-at-cap):

1. Run `scripts/sdd-publish <plan>`. It prints a bundle: for every completed
   task, its commit range, the `task-N-brief.md` and `task-N-report.md` paths,
   and a `git diff --stat` over that range, plus the spec's
   `.annotations.json` sidecar path and whether it exists. It reads no consent
   and interprets nothing.
2. Read the bundle. For each task, read its brief and report to get the title
   and status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`); this is one
   **substate**, key `task-N`, in ledger order.
3. If the sidecar exists, match each entry's verbatim `text` against the task
   briefs and reports to find the task that implemented it, and attach it to
   that substate as a source.
   - Entries you cannot confidently match are **dropped and counted**, never
     reassigned to a plausible-looking task. Report the tally in
     `annotationCoverage`.
   - **If the sidecar does not exist, build anyway with no sources.**
4. Cluster the substates into 2–5 **states**, from scratch, every call. Each
   state names what a group of tasks accomplished, not what the individual
   tasks were. Clusters are not sticky.
5. Pipe the assembled document — every completed task so far, full fidelity,
   including `notes` and requirement `text` regardless of consent — into
   `scripts/sdd-graph write <plan>`. This always happens.
6. Run `scripts/sdd-graph payload <spec-slug>`. If it prints a `skipped:` line,
   stop here: there is no consent, and the local graph is already built. If it
   prints a payload, pass it verbatim to `publish_graph` — do not edit it and
   do not re-filter it yourself; the filtering already happened.
7. Record the outcome: `scripts/sdd-graph record-publish <spec-slug> --sent
   --omitted <the list printed on stderr>`, or `--skipped <reason>`.
````

- [ ] **Step 3: Extend the red flags table in `publishing-graphs.md`**

Add these rows to the existing table:

```markdown
| "No consent, so there's nothing to build" | The local graph is built either way. Consent only gates sending. |
| "I'll trim the payload before sending it" | `sdd-graph payload` already applied the scope. Editing it afterwards is how a declined field gets sent. |
| "I'll skip record-publish, it's just bookkeeping" | It's the only record of what left the machine. Without it the viewer lies. |
```

- [ ] **Step 4: Update the Setup step in `SKILL.md`**

Locate the step that reads the consent file:

```bash
grep -n "sharing.json\|publishing-graphs" skills/subagent-driven-development/SKILL.md
```

Reword that step so it says the local graph is built after every completed task regardless of consent, and that consent is asked once at Setup for publishing only — pointing at `publishing-graphs.md` for the exact wording rather than repeating it.

- [ ] **Step 5: Update `how-governed-superpowers-works.md`**

In the pipeline table, replace the stage 05 row with two rows:

```markdown
| 05 (always, local) | `sdd-graph write`, inside `subagent-driven-development` | graph → `.governed-superpowers/graphs/`, a new revision after every completed task |
| 06 (opt-in) | consent gate + `sdd-graph payload` → `publish_graph` | local graph → account portal, scope-filtered |
```

Then add this paragraph immediately before the consent gate subsection of "Publishing the collaboration graph, live (opt-in)":

```markdown
Since the local-build change, the graph exists on disk before any of this
applies. `sdd-graph write` appends an immutable revision under
`.governed-superpowers/graphs/` after every completed task, carrying the full
requirement text and changed-file list regardless of consent, and the
`docker-compose.viewer.yml` viewer renders it locally with a revision
scrubber. Publishing is an export of that artifact: `sdd-graph payload`
applies the consent scope, and `sdd-graph record-publish` writes back what was
actually sent, so "what left this machine" is answerable from disk.
```

- [ ] **Step 6: Verify no stale claims remain**

Run:

```bash
grep -rn "no active consent" skills/ docs/governed-superpowers/how-governed-superpowers-works.md
```

Expected: matches only in `lib/cli.mjs`'s `payload` output and the step 6 description of it — no remaining claim that `sdd-publish` skips when consent is missing.

- [ ] **Step 7: Commit**

```bash
git add skills/subagent-driven-development/publishing-graphs.md skills/subagent-driven-development/SKILL.md docs/governed-superpowers/how-governed-superpowers-works.md
git commit -m "docs: describe the unconditional local graph build and the export step"
```

---

## Final verification

- [ ] **Run every suite**

```bash
tests/local-graphs/test-local-graphs.sh
tests/local-graphs/test-sdd-publish.sh
scripts/lint-shell.sh
cd viewer && npm run lint && npm test && npm run build
```

Expected: all exit 0.

- [ ] **End-to-end smoke test**

From a repo with at least one completed SDD task:

```bash
skills/subagent-driven-development/scripts/sdd-publish docs/governed-superpowers/plans/<plan>.md
# assemble the document from that bundle, save it to /tmp/doc.json, then:
skills/subagent-driven-development/scripts/sdd-graph write docs/governed-superpowers/plans/<plan>.md < /tmp/doc.json
skills/subagent-driven-development/scripts/sdd-graph payload <spec-slug>
docker compose -f docker-compose.viewer.yml up --build -d
curl -fsS http://127.0.0.1:3100/api/healthz
```

Expected: `write` reports the revision number; `payload` prints either a full payload or a `skipped:` line depending on `sharing.json`; the viewer serves the sheet at `http://localhost:3100` with the publish banner reflecting whichever of those happened.
