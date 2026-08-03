import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

// ---- write ----

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

  const current = JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"));
  assert.equal(current.revision, 2);
  assert.deepEqual(current.trigger, { task: 2, reason: "task-complete" });

  const index = JSON.parse(readFileSync(graphsPath(root, "index.json"), "utf8"));
  assert.equal(index.sheets.length, 1, "the same spec must not produce a second index entry");
  assert.equal(index.sheets[0].currentRevision, 2);
  assert.equal(index.sheets[0].revisionCount, 2);
});

test("two different specs get separate sheets in one index", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  invoke(
    root,
    ["write", "docs/plans/b.md"],
    doc({ spec: { path: "docs/specs/b-design.md", title: "B design" } })
  );

  const index = JSON.parse(readFileSync(graphsPath(root, "index.json"), "utf8"));
  assert.deepEqual(index.sheets.map((sheet) => sheet.slug), ["a-design", "b-design"]);
  assert.ok(existsSync(graphsPath(root, "b-design", "revisions", "0001.json")));
});

test("an explicit spec.planPath in the document wins over the argument", () => {
  const root = tempRoot();
  invoke(
    root,
    ["write", "docs/plans/from-arg.md"],
    doc({ spec: { path: "docs/specs/a-design.md", title: "A design", planPath: "docs/plans/from-doc.md" } })
  );

  const current = JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"));
  assert.equal(current.spec.planPath, "docs/plans/from-doc.md");
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

test("a document that would throw the old validator still writes nothing", () => {
  const root = tempRoot();
  const bad = JSON.parse(doc());
  bad.states = [null];

  const result = invoke(root, ["write", "docs/plans/a.md"], JSON.stringify(bad));

  assert.equal(result.code, 1);
  assert.match(result.stderr, /states\[0\]/);
  assert.equal(existsSync(graphsPath(root)), false);
});

test("a failed write leaves an existing store untouched", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  const before = readFileSync(graphsPath(root, SLUG, "current.json"), "utf8");
  const indexBefore = readFileSync(graphsPath(root, "index.json"), "utf8");

  const bad = JSON.parse(doc());
  bad.states = [];
  assert.equal(invoke(root, ["write", "docs/plans/a.md"], JSON.stringify(bad)).code, 1);

  assert.equal(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"), before);
  assert.equal(readFileSync(graphsPath(root, "index.json"), "utf8"), indexBefore);
  assert.deepEqual(readdirSync(graphsPath(root, SLUG, "revisions")), ["0001.json"]);
});

test("unparseable stdin exits nonzero without writing", () => {
  const root = tempRoot();
  const result = invoke(root, ["write", "docs/plans/a.md"], "{not json");

  assert.equal(result.code, 1);
  assert.match(result.stderr, /could not parse/i);
  assert.equal(existsSync(graphsPath(root)), false);
});

test("write without a plan argument exits 2 with usage", () => {
  const result = invoke(tempRoot(), ["write"], doc());
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: sdd-graph/);
});

test("an unknown subcommand exits 2 with usage", () => {
  const result = invoke(tempRoot(), ["frobnicate"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: sdd-graph/);
});

test("no subcommand at all exits 2 with usage", () => {
  const result = invoke(tempRoot(), []);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: sdd-graph/);
});

// ---- payload ----

/** Writes raw bytes as the temp store's sharing.json. */
function writeSharing(root, raw) {
  const dir = join(root, ".governed-superpowers");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sharing.json"), raw);
}

/** Writes a well-formed sharing.json into the temp store's repo root. */
function grantConsent(root, overrides = {}) {
  writeSharing(
    root,
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
  assert.match(result.stdout, /^skipped: \.governed-superpowers\/sharing\.json revokedAt is set/);
});

test("payload writes nothing to the store", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  grantConsent(root);
  const before = readFileSync(graphsPath(root, SLUG, "current.json"), "utf8");
  const indexBefore = readFileSync(graphsPath(root, "index.json"), "utf8");

  assert.equal(invoke(root, ["payload", SLUG]).code, 0);

  assert.equal(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"), before);
  assert.equal(readFileSync(graphsPath(root, "index.json"), "utf8"), indexBefore);
  assert.deepEqual(readdirSync(graphsPath(root, SLUG, "revisions")), ["0001.json"]);
});

test("payload for an unknown slug exits nonzero", () => {
  const root = tempRoot();
  grantConsent(root);

  const result = invoke(root, ["payload", "no-such-sheet"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no local graph for 'no-such-sheet'/);
});

test("payload without a slug argument exits 2 with usage", () => {
  const result = invoke(tempRoot(), ["payload"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: sdd-graph/);
});

test("payload treats a falsy-but-present revokedAt (empty string) as revoked, not as absent", () => {
  // revokedAt is documented as either null (not revoked) or an ISO timestamp
  // string (revoked); "" is neither, but it is not null/undefined either. The
  // check is written as `!== null && !== undefined` specifically so that ANY
  // present value - even a falsy one like "" - counts as "set" and triggers
  // the skip, matching publishing-graphs.md's "missing, or its revokedAt is
  // not null" rule. A naive `if (consent.revokedAt)` truthy-check would get
  // this backwards: "" is falsy, so it would (incorrectly) let the payload
  // proceed. This pins the correct (skip) behavior against that mutation.
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  grantConsent(root, { revokedAt: "" });

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: \.governed-superpowers\/sharing\.json revokedAt is set/);
});

test("payload prints 'omitted: nothing' to stderr when consent is full and nothing is withheld", () => {
  const root = tempRoot();
  invoke(
    root,
    ["write", "docs/plans/a.md"],
    doc({
      states: [
        {
          key: "s1",
          label: "First chunk",
          substates: [{ key: "task-1", title: "Do the thing", status: "DONE" }],
        },
      ],
    })
  );
  grantConsent(root);

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /^omitted: nothing/);
});

test("payload skips when sharing.json is not valid JSON", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  writeSharing(root, "{not json");

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: \.governed-superpowers\/sharing\.json is not valid JSON/);
});

test("payload skips when sharing.json has no scope key at all", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  writeSharing(root, "{}");

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: \.governed-superpowers\/sharing\.json has no scope object/);
});

test("payload skips when sharing.json's scope is explicitly null", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  grantConsent(root, { scope: null });

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: \.governed-superpowers\/sharing\.json has no scope object/);
});

test("payload skips when sharing.json's scope is an array, not an object", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  grantConsent(root, { scope: ["specPaths"] });

  const result = invoke(root, ["payload", SLUG]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^skipped: \.governed-superpowers\/sharing\.json has no scope object/);
});

// ---- record-publish ----

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

test("record-publish only stamps the current revision, leaving older revisions untouched", () => {
  const root = tempRoot();
  invoke(root, ["write", "docs/plans/a.md"], doc());
  invoke(root, ["write", "docs/plans/a.md"], doc({ trigger: { task: 2, reason: "task-complete" } }));
  const firstBefore = readFileSync(graphsPath(root, SLUG, "revisions", "0001.json"), "utf8");

  assert.equal(invoke(root, ["record-publish", SLUG, "--sent"]).code, 0);

  assert.equal(
    readFileSync(graphsPath(root, SLUG, "revisions", "0001.json"), "utf8"),
    firstBefore,
    "revision 1 must be untouched by a publish recorded after revision 2 was written"
  );

  const stored2 = JSON.parse(readFileSync(graphsPath(root, SLUG, "revisions", "0002.json"), "utf8"));
  const current = JSON.parse(readFileSync(graphsPath(root, SLUG, "current.json"), "utf8"));
  assert.deepEqual(stored2.publish, current.publish);
  assert.match(current.publish.sentAt, /^\d{4}-\d{2}-\d{2}T/);
});
