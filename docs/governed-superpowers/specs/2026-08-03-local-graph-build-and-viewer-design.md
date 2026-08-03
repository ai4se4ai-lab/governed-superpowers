# Local collaboration-graph build and Docker viewer

## Problem

A plan's collaboration graph currently exists only in transit. `scripts/sdd-publish` prints a
bundle, the controlling agent interprets it in-session, and the result goes straight into a
`publish_graph` MCP call. Nothing is written to disk at any point.

Two consequences follow. First, a human partner cannot see what the graph says before it is
sent — the consent decision is made against a description of the payload rather than the payload
itself. Second, a human partner who declines to publish gets nothing at all: the graph is a
feature of having an account, not a feature of having done the work.

Worse, the build is gated on consent. `scripts/sdd-publish` exits early and bundles nothing when
`.governed-superpowers/sharing.json` is missing, so declining to share also means declining to
have the graph exist.

## Solution overview

Invert the order. The graph is built locally on every completed task regardless of consent, and
published only as an export of that already-existing local artifact.

The system must build a local collaboration-graph revision after every completed task,
independent of whether any publish consent exists.[^1] Publishing must read that local artifact
rather than assembling a payload independently.[^2]

```
task completes
  └─ scripts/sdd-publish <plan>              mechanical bundle (unchanged in shape)
        └─ agent interprets: titles, statuses, annotation matching, clustering
              └─ scripts/sdd-graph write <plan>          stdin = full-fidelity JSON
                    ├─ validates, computes provenance counts
                    ├─ .governed-superpowers/graphs/<slug>/revisions/NNNN.json
                    ├─ .governed-superpowers/graphs/<slug>/current.json
                    └─ .governed-superpowers/graphs/index.json
              └─ scripts/sdd-graph payload <slug>        only reached with consent
                    └─ prints scope-filtered publish_graph args → agent calls the tool
                          └─ scripts/sdd-graph record-publish <slug> --sent|--skipped
```

The interpretive/mechanical split that governs the existing flow is preserved. The agent still
performs the only judgment-bearing steps — matching annotation text to tasks, naming clusters.
The new script performs validation, counting, revision numbering, scope filtering and outcome
recording, all of which are mechanical and testable without an agent in the loop.

## Components

### 1. `scripts/sdd-graph` — the local graph store CLI

A Node script with no third-party dependencies, living beside the existing scripts at
`skills/subagent-driven-development/scripts/`.[^3] It exposes three subcommands.

**`sdd-graph write <plan>`** reads a full-fidelity graph document on stdin, validates it,
computes provenance counts, allocates the next revision number, and writes the revision file,
`current.json` and `index.json`. Invalid input must cause a nonzero exit naming the offending
field path, with no file written — a failed build must never leave a partial revision or an
index pointing at a revision that does not exist.[^4]

**`sdd-graph payload <slug>`** reads `current.json` and `.governed-superpowers/sharing.json` and
prints the complete `publish_graph` argument object with the consent scope applied. When
`sharing.json` is absent or its `revokedAt` is non-null, it must print a single `skipped:` line
and exit 0 without printing a payload.[^5] Consent is therefore re-read on every publish attempt,
preserving the existing property that a mid-plan revocation takes effect on the next task.

**`sdd-graph record-publish <slug>`** stamps the outcome of a publish attempt — `--sent` with the
list of omitted fields, or `--skipped <reason>` — onto the current revision and the index entry.

The script must not require any package installation to run; a Node runtime is its only
prerequisite.[^6]

### 2. The on-disk store

Local graphs live at `.governed-superpowers/graphs/`, beside `sharing.json` and the SDD progress
ledger, and are git-ignored — they must never enter the repository's history.[^7]

```
.governed-superpowers/graphs/
  index.json
  2026-08-03-local-graph-build-and-viewer-design/     slug = spec filename minus .md
    current.json                                      a copy of the newest revision
    revisions/
      0001.json
      0002.json
```

`index.json` holds one entry per spec — `slug`, `specPath`, `title`, `planPath`,
`currentRevision`, `revisionCount`, `updatedAt`, and the last publish outcome — so the viewer's
sheet list never has to open a revision file. It is rewritten in full on every `write`, so a
damaged entry is repaired by the next task rather than needing manual intervention.[^8]

A revision file:

```json
{
  "formatVersion": 1,
  "revision": 3,
  "builtAt": "2026-08-03T14:22:10Z",
  "trigger": { "task": 3, "reason": "task-complete" },
  "spec": {
    "path": "docs/governed-superpowers/specs/2026-08-03-local-graph-build-and-viewer-design.md",
    "title": "Local collaboration-graph build and Docker viewer",
    "planPath": "docs/governed-superpowers/plans/2026-08-03-local-graph-build-and-viewer.md"
  },
  "states": [
    {
      "key": "local-store",
      "label": "Build the graph locally",
      "summary": "The CLI, its format, and its tests",
      "substates": [
        {
          "key": "task-3",
          "title": "sdd-graph write and its tests",
          "status": "DONE",
          "changes": [{ "path": "skills/.../scripts/sdd-graph", "summary": "New local store CLI" }],
          "commits": ["be87ae0", "dc95ffc"],
          "notes": null,
          "sources": [
            { "marker": "6", "source": "human", "ref": null, "text": "…verbatim requirement…" }
          ],
          "humanCount": 1,
          "aiCount": 4,
          "groundedCount": 2
        }
      ]
    }
  ],
  "stateEdges": [],
  "substateEdges": [],
  "annotationCoverage": { "mapped": 11, "total": 15 },
  "publish": { "sentAt": null, "skippedReason": "no-consent", "omittedFields": [] }
}
```

Four properties of this format:

**Full fidelity.** A revision must carry `changes`, `commits`, `sources[].ref` and
`sources[].text` unconditionally, regardless of the consent scope — scope filtering happens only
at send time.[^9] The local graph is never degraded by a sharing decision that does not affect
it.

**Immutable except for `publish`.** Every field other than the `publish` block is written once.
Re-running a task must append a new revision rather than editing an existing one.[^10]

**Precomputed counts.** `humanCount`, `aiCount` and `groundedCount` are computed at write time
using the same rule the portal applies: `human` and `ai_assumption` feed the two-sided axis, and
the remaining four provenance sources (`skill_doc`, `tool_output`, `existing_codebase`,
`external_reference`) feed `groundedCount` only.[^11] The viewer therefore needs no knowledge of
the taxonomy.

**Versioned.** Revision numbers are zero-padded, monotonic, and allocated by reading the highest
existing revision file, so the numbering cannot drift from the directory contents.[^12] The
viewer must refuse to render a revision whose `formatVersion` it does not recognise rather than
attempting a partial render.[^13] The build script writes `formatVersion: 1` only.

Concurrent writes to one slug are out of scope: a single plan executes at a time.

### 3. Scope filtering at the boundary

`sdd-graph payload` is the only place consent scope is applied.

| Scope flag off | Wire effect |
|---|---|
| `changePaths` | `substates[].changes` omitted entirely |
| `annotationText` | `sources[].text` omitted; `source` and `ref` still sent |
| `specPaths` | `spec.path` and `spec.title` replaced with opaque values (below) |
| `substateTitles` | task titles and state labels replaced with positional values (below) |

The server's schema requires `spec.path`, `spec.title` and `substates[].title`, each
`z.string().min(1)`, so a declined flag cannot be expressed by omitting the field.[^14] Two
substitutions cover the gap:

- When `specPaths` is false, `spec.path` must be sent as `opaque:<first 16 hex of sha256 of the
  repo-relative path>` and `spec.title` as `Sheet <first 8 hex of that digest>`.[^15] The value
  is stable across publishes, so the portal's replace-contents-preserve-tab-name behaviour still
  works and the human partner can rename the sheet themselves.
- When `substateTitles` is false, `substates[].title` must be sent as `Task <N>` derived from the
  substate key, `states[].label` as `Group <n>`, and `states[].summary` omitted.[^16] State
  labels are agent-written prose describing the spec's content; blanking task titles while
  sending them would leave the flag ineffective.

Two further rules: `substates[].notes` is written locally but must never be sent, since no scope
flag covers free text lifted from task reports.[^17] `commits` keeps its current always-sent
behaviour, as short SHAs carry no content without the repository.

### 4. `viewer/` — the local viewer application

A Next.js application mirroring `web/` without Prisma, authentication or email.[^18] The reuse
seam is `loadGraph` in `web/src/app/(app)/graphs/page.tsx`, which already returns a plain
`GraphPayload` consumed by a pure client component.

- **Copied byte-identical:** `src/lib/graph-color.ts` and `src/lib/graph-layout.ts`. Both are
  import-free pure modules. A test must assert the viewer's copies are byte-identical to the
  portal's, so colour thresholds and canvas geometry cannot silently diverge.[^19]
- **Copied, allowed to diverge:** `graph-workspace`, `graph-canvas`, `nodes/*`,
  `substate-drawer`, `sheet-tabs`, `types.ts`. `project-picker` is dropped — one mount, one
  project.
- **New:** `viewer/src/lib/graph-store.ts` reads the directory named by `GRAPH_DIR` and returns
  the same `GraphPayload` shape, synthesising node ids (`state-<key>`,
  `sub-<stateKey>-<key>`) in place of the database's row ids.[^20]

Routes: `/` lists sheets from `index.json`; `/sheet/[slug]` renders the canvas for the revision
named by `?rev=`, defaulting to the current one; `/api/healthz` backs the container healthcheck.[^21]

Three views the portal does not have, all reading from data the store already holds:

1. A revision scrubber stepping through revisions 1..N, re-rendering the canvas for the selected
   revision.[^22]
2. A per-revision publish banner rendered from the `publish` block — either the send time and the
   fields that were omitted, or the reason it was never sent.[^23]
3. The `annotationCoverage` fraction shown as text alongside the canvas.[^24]

### 5. `docker-compose.viewer.yml`

A separate compose file, not a profile inside `docker-compose.yml`, so that starting the viewer
can never start Postgres, the MCP server or Caddy.[^25]

```yaml
services:
  graph-viewer:
    build: { context: ./viewer }
    ports: ["127.0.0.1:${VIEWER_PORT:-3100}:3000"]
    volumes:
      - ${GRAPH_DIR:-./.governed-superpowers/graphs}:/graphs:ro
    environment: ["GRAPH_DIR=/graphs", "PORT=3000"]
```

The published port must bind to loopback only, and the graph directory must be mounted
read-only.[^26] The data is unauthenticated and the viewer has no reason to write. Pointing the
viewer at a different repository is a `GRAPH_DIR` change; serving two repositories at once means
two containers on two ports, which the `VIEWER_PORT` variable already allows.

`viewer/Dockerfile` mirrors `web/Dockerfile`'s deps → builder → standalone-runtime chain without
the Prisma migrator stage and without the OpenSSL package that only Prisma's query engine
needs.[^27]

## Error handling

| Condition | Behaviour |
|---|---|
| Invalid stdin to `sdd-graph write` | Nonzero exit naming the field path; nothing written |
| `sharing.json` missing or revoked | `payload` prints `skipped: …`, exits 0 |
| `GRAPH_DIR` missing or empty | Viewer renders an empty state explaining graphs appear after the first completed task — never a 500[^28] |
| Malformed or unknown-`formatVersion` revision | Viewer renders an error card naming the file; the sheet list still loads[^29] |
| Requested `?rev=` out of range | Viewer falls back to the current revision |

## Testing

Script tests live at `tests/local-graphs/` and cover `write` (validation rejection, revision
numbering, count computation), `payload` (each scope flag's effect, the missing-consent and
revoked paths) and `record-publish`.[^30]

Viewer tests live at `viewer/test/*.test.ts` and run under `tsx --test`, matching the existing
`web/test/` convention.[^31] They cover `graph-store` loading against fixture directories, the
byte-identity drift guard, and the malformed-input paths above.

## Documentation and skill changes

`skills/subagent-driven-development/publishing-graphs.md` is rewritten for build-always /
send-on-consent, and `docs/governed-superpowers/how-governed-superpowers-works.md` gains the new
local-build stage.

`scripts/sdd-publish`'s early exit on missing consent must be removed, since the bundle is now
needed for the unconditional local build.[^32]

The `publishing-graphs.md` rewrite and the SKILL.md consent wording are behaviour-shaping skill
content. Per this repository's contributor guidelines, such changes require adversarial pressure
testing and before/after eval evidence rather than being treated as documentation edits.[^33]

## Out of scope

- Serving multiple repositories from one viewer container.
- Building local graphs from the `executing-plans` path; only `subagent-driven-development`
  produces the ledger this depends on.
- Any change to the portal's database schema or its existing publish semantics.
- Manual node arrangement or any persisted canvas geometry.
