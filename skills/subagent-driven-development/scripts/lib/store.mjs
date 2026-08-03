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
