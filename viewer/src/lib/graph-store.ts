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
      .filter((file) => /^\d{4,}\.json$/.test(file))
      .map((file) => Number(file.slice(0, file.length - ".json".length)))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export type RawSource = {
  marker?: string | null;
  source: string;
  ref?: string | null;
  text?: string | null;
};

export type RawSubstate = {
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

export type RawState = {
  key: string;
  label: string;
  summary?: string | null;
  substates: RawSubstate[];
};

export type RawRevision = {
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

export function toPayload(raw: RawRevision): GraphPayload {
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

  // The portal (mcp-server/src/graphs.ts) rejects a document with an
  // unresolvable edge endpoint outright at publish time. The viewer has no
  // such option - it must render whatever is actually on disk - so instead
  // of crashing or fabricating a node for a typo'd/malformed endpoint, it
  // silently drops any edge that doesn't resolve to a real node in this
  // same document.
  const known = new Set(states.flatMap((s) => [s.id, ...s.substates.map((x) => x.id)]));

  const stateEdges = (raw.stateEdges ?? [])
    .map((edge) => ({ fromId: stateId(edge.from), toId: stateId(edge.to) }))
    .filter((edge) => known.has(edge.fromId) && known.has(edge.toId));

  // Substate edge endpoints arrive as "<stateKey>/<substateKey>", the same
  // form publish_graph accepts.
  const substateEdges = (raw.substateEdges ?? [])
    .map((edge) => {
      const [fromState, fromSub] = edge.from.split("/");
      const [toState, toSub] = edge.to.split("/");
      return { fromId: substateId(fromState, fromSub), toId: substateId(toState, toSub) };
    })
    .filter((edge) => known.has(edge.fromId) && known.has(edge.toId));

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
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    const message = error instanceof Error ? error.message : String(error);
    return { slug, file, message: `could not read this revision: ${message}` };
  }

  if (raw.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    return {
      slug,
      file,
      message: `this revision declares formatVersion ${raw.formatVersion}; this viewer only renders version ${SUPPORTED_FORMAT_VERSION}`,
    };
  }

  if (typeof raw.spec?.title !== "string" || !Array.isArray(raw.states)) {
    return { slug, file, message: "this revision is missing spec.title or states" };
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
