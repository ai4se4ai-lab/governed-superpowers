/**
 * Local collaboration-graph store CLI.
 *
 *   sdd-graph write PLAN_FILE          < document.json
 *   sdd-graph payload SLUG
 *   sdd-graph record-publish SLUG --sent [--omitted a,b] | --skipped REASON
 *
 * `write` is unconditional: the local graph is built whether or not the human
 * partner has consented to publishing anything. Consent is read only by
 * `payload`, the single point where anything is prepared to leave the
 * machine — see Task 7, which adds `record-publish` here.
 *
 * run() takes its I/O as an argument and returns an exit code rather than
 * calling process.exit, so the whole surface is testable in-process. The
 * executable shim supplies the real streams.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withCounts } from "./counts.mjs";
import { applyScope } from "./scope.mjs";
import {
  FORMAT_VERSION,
  nextRevisionNumber,
  readIndex,
  readJson,
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

  // Validated before anything on disk is touched: a rejected document must
  // never leave a partial revision or an index pointing at one.
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
      // The document's own planPath wins when present: sdd-publish's bundle
      // always knows the argument, but the document is assembled by the
      // agent from the plan, which may already carry a planPath it read
      // itself. Falling back to the argument, rather than requiring it in
      // the document, keeps the document schema unchanged from Task 2.
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

const SHARING_REL = ".governed-superpowers/sharing.json";

/**
 * Consent is read here and nowhere else, and re-read on every call - a
 * revocation mid-plan must stop the very next update, not the next plan.
 * A missing, unreadable, or revoked record is not an error: it prints one
 * line on stdout and exits 0, exactly like sdd-publish's old skip.
 * "Unreadable" covers unparseable JSON and a missing/invalid scope object —
 * anything that would make applyScope's already-validated-input contract a
 * lie.
 */
function commandPayload(args, io) {
  const slug = args[0];
  if (!slug) {
    io.err(`${USAGE}\n`);
    return 2;
  }

  const root = io.root ?? repoRoot();
  const sharingPath = join(root, SHARING_REL);

  if (!existsSync(sharingPath)) {
    io.out(`skipped: no ${SHARING_REL} -- no active consent\n`);
    return 0;
  }

  let consent;
  try {
    consent = readJson(sharingPath);
  } catch (error) {
    io.out(`skipped: ${SHARING_REL} is not valid JSON (${error.message}) -- no usable consent\n`);
    return 0;
  }

  if (consent.revokedAt !== null && consent.revokedAt !== undefined) {
    io.out(`skipped: ${SHARING_REL} revokedAt is set -- consent revoked\n`);
    return 0;
  }

  // scope.mjs promises applyScope never throws, on the condition that its input
  // is a usable consent record - see scope.mjs's header. Enforcing that here is
  // what makes the promise true: applyScope reads scope.<flag> unguarded, so a
  // null/absent/malformed scope would be a TypeError inside a function
  // documented as infallible.
  if (!consent.scope || typeof consent.scope !== "object" || Array.isArray(consent.scope)) {
    io.out(`skipped: ${SHARING_REL} has no scope object -- no usable consent\n`);
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

export function run(argv, io) {
  const [command, ...args] = argv;
  switch (command) {
    case "write":
      return commandWrite(args, io);
    case "payload":
      return commandPayload(args, io);
    case "record-publish":
      return commandRecordPublish(args, io);
    default:
      io.err(`${USAGE}\n`);
      return 2;
  }
}
