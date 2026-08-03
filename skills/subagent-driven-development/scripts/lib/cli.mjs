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
 * machine — see Tasks 6 and 7, which add the other two subcommands here.
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
