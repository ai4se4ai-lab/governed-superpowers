# How Governed-Superpowers works

A step-by-step trace of the skill pipeline — brainstorming, spec, plan, build, review, ship — and exactly what gets written down, where, and what (if anything) leaves the machine.

> **One correction up front:** the project's MCP server does *not* record collaboration or build a graph of it. It's a read-only library that serves skill text to remote clients. The actual collaboration-recording mechanism lives elsewhere — in the `brainstorming` skill's provenance sidecar and an opt-in publish step at the end of `subagent-driven-development`. Both are covered in full below.

## The pipeline, end to end

Every non-trivial change in this project passes through the same six skills, in the same order, each handing off to exactly one successor. Nothing before `brainstorming`'s approval gate touches code.

| Stage | Skill | Moves |
|---|---|---|
| 01 | `governed-superpowers:brainstorming` | idea → approved spec |
| 02 | `governed-superpowers:writing-plans` | spec → task plan |
| 03 | `governed-superpowers:subagent-driven-development` | plan → reviewed code (uses `test-driven-development` inside every task) |
| 04 | `governed-superpowers:finishing-a-development-branch` | merge / PR / keep |
| 05 (opt-in) | publish step inside `subagent-driven-development` | graph → account portal |

Two execution paths exist at stage 03 — `subagent-driven-development` (same session, fresh subagent per task) or `executing-plans` (separate session, inline). Only the subagent path produces a publishable collaboration graph; that's where the provenance data gets assembled.

## 01 — Brainstorming → spec

**Skill:** `governed-superpowers:brainstorming` · **Human role:** answers, approves · **AI role:** asks, proposes, drafts

Triggered on any creative or feature work. A hard gate blocks every implementation skill until a design is presented *and approved* — this applies even to a one-function utility.

1. **Explore context** — reads files, docs, recent commits before asking anything.
2. **Offers the visual companion, just-in-time** — a local browser tab for mockups/diagrams, only the first time a question is genuinely visual, never upfront.
3. **Asks one clarifying question at a time** — purpose, constraints, success criteria. Multiple-choice where possible.
4. **Proposes 2–3 approaches** with trade-offs and a recommendation.
5. **Presents the design in sections**, asking approval after each one — architecture, components, data flow, error handling, testing.
6. **Writes the spec** to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md`, plus a provenance sidecar (see below), and commits both.
7. **Self-reviews** the written spec for placeholders, contradictions, scope, and provenance-marker consistency — fixed inline, no separate loop.
8. **Hands the file back to the human** for review before anything proceeds.

**Hard gate:** no code, no scaffolding, no implementation skill runs until step 5's approval and step 8's file review both land. The skill's only permitted successor is `writing-plans` — never a direct jump to implementation.

The design document is never a transcript. Every line has already survived one chat-visible approval (step 5) before it's written to disk, a silent self-review pass (step 7), and a second approval on the file itself (step 8).

## Recording provenance — where the collaboration ledger actually lives

This is the real answer to "how is human/AI collaboration recorded." As the spec is drafted, every discrete requirement — a testable "must / shall / will" sentence — is tagged with exactly one source. Rationale and connective prose are left untagged; tagging every sentence would bury the signal.

Source taxonomy (`skills/brainstorming/SKILL.md`, "Provenance Tagging"):

| Source | Meaning | `ref` field |
|---|---|---|
| `human` | Verbatim user input given this session | `null` |
| `ai_assumption` | Agent-inferred, nothing else grounds it — the default | `null` |
| `skill_doc` | Grounded in a skill file or project doc | file path + lines |
| `tool_output` | Grounded in graphify or another tool's output | the command run |
| `existing_codebase` | Grounded in a pattern found in the repo | `file:line` |
| `external_reference` | Grounded in a web search / fetched doc | URL |

The spec file (`.md`) stays plain-readable — requirements just get sequential footnote markers, `[^1]`, `[^2]`... The actual source, ref, and verbatim requirement text live in a same-basename sidecar:

```
docs/governed-superpowers/specs/2026-08-01-example-design.md
docs/governed-superpowers/specs/2026-08-01-example-design.annotations.json
```

```json
{
  "1": { "source": "human", "ref": null,
         "text": "every requirement must be tagged with a provenance source" },
  "2": { "source": "existing_codebase",
         "ref": "skills/brainstorming/SKILL.md:107-110",
         "text": "Write the validated design to a spec file, named with today's date and topic." }
}
```

The tag is shown inline in chat as it's drafted — `"The CLI must support --dry-run.[^3: ai_assumption]"` — so the human is approving the source, not just the sentence, before the file is ever written. The self-review step (07 above) checks every marker resolves to a sidecar entry and vice versa; no orphans in either direction. Revised requirements are re-tagged against the new wording, usually reverting to `ai_assumption` unless the edit itself supplied new grounding.

## 02 — Planning the implementation

**Skill:** `governed-superpowers:writing-plans` · **Human role:** reviews structure, picks execution mode · **AI role:** decomposes into tasks

Takes the approved spec and produces `docs/governed-superpowers/plans/YYYY-MM-DD-<feature>.md` — written for an engineer who is skilled but has zero context on this codebase. Files are mapped before tasks are drawn, so decomposition decisions get locked in early.

Each task is bite-sized: write failing test → verify it fails → minimal implementation → verify it passes → commit. No placeholders are allowed anywhere — `"TBD"`, `"add appropriate error handling"`, and `"similar to Task N"` are treated as plan failures, not style notes.

**Handoff:** once the plan is saved, the human is asked to choose between **Subagent-Driven** (dispatch a fresh subagent per task, in-session) or **Inline Execution** (`executing-plans`, checkpointed, often a separate session). That choice determines whether a collaboration graph gets produced at all — only the subagent path builds one.

## 03 — Executing: subagents, review, TDD

**Skill:** `governed-superpowers:subagent-driven-development` · **Human role:** answers blockers, adjudicates deadlocks · **AI role:** dispatches, reviews, fixes

The controlling session never writes implementation code itself. For each task it dispatches a fresh implementer subagent with no memory of the rest of the session — just its task brief, the interfaces it touches, and global constraints. That subagent follows `test-driven-development` for every line: no production code without a failing test written first, watched fail, then made to pass minimally.

**The per-task loop:**

1. Dispatch implementer → it implements, tests, commits, self-reviews.
2. Dispatch a *task reviewer* subagent against the diff — spec compliance and code quality, both required.
3. Findings enter a capped fix loop (5 rounds: 1–3 resume the same implementer, 4–5 escalate to a fresh implementer on a stronger model).
4. Every round ends in a *scoped re-review*, never a self-certified fix.
5. A task completes only when the review is clean, or every open finding is parked with a written ruling at the round cap.

Progress survives context loss through a **ledger** (`.governed-superpowers/sdd/<plan>/progress.md`) — every dispatch, finding, fix round, and adjudication is appended there, not just tracked in the session's memory. After all tasks, one final whole-branch review runs on the most capable available model before anything ships.

## 04 — Finishing the branch

**Skill:** `governed-superpowers:finishing-a-development-branch` · **Human role:** decides integration path · **AI role:** runs tests, presents options, executes

Full test suite runs first — a red suite stops everything before any menu is shown. On green, the human is presented exactly one of two fixed menus and the decision is theirs alone:

| Normal repo / named branch | Detached HEAD (managed workspace) |
|---|---|
| 1. Merge to base branch locally<br>2. Push and open a PR<br>3. Keep as-is | 1. Push as new branch, open a PR<br>2. Keep as-is |

Discarding work is never inferred from tone — only the literal typed word `discard` authorizes deleting a branch and its worktree.

## 05 — Publishing the collaboration graph (opt-in)

**Skill:** `subagent-driven-development` → `publishing-graphs.md` · **Human role:** grants or refuses consent, per project · **AI role:** assembles payload, asks first

This is the mechanism the original question was really asking about. After a plan finishes, its ledger and its spec's provenance sidecar can — *only with explicit, per-project consent* — be turned into a diagram and sent to the account portal's database.

### Consent gate

The agent checks `.governed-superpowers/sharing.json` (git-ignored, so it never leaves the machine on its own). If missing or revoked, it must stop and ask, verbatim:

> "I can publish this plan's collaboration graph to your Governed-Superpowers account — a diagram of what got built and which parts trace back to your input versus my own assumptions. It would send: the spec's path, the task titles from this plan, the files each task changed, and the requirement text from the spec's annotations sidecar. Want me to?"

A hedged "sure, whatever" is explicitly *not* read as consent to send requirement text — each of the four fields below is its own opt-in flag, and a declined flag means the field is **omitted**, never sent blank.

```json
{
  "version": 1,
  "project": { "slug": "evergrace-app", "name": "Evergrace",
               "originHash": "sha256:3f9a…" },
  "scope": {
    "specPaths": true, "substateTitles": true,
    "changePaths": true, "annotationText": true
  },
  "grantedAt": "2026-08-01T14:22:10Z",
  "grantedBy": "human partner, in session",
  "revokedAt": null
}
```

`originHash` is a SHA-256 of the git remote URL (or repo path if there's none) — hashed so the server never learns the actual directory layout. The server enforces this as an *audit trail*, not access control: it cannot read your disk, so it can only confirm the payload carries a well-formed, unrevoked, under-a-year-old consent record whose scope matches the fields present.

### What gets assembled

1. Each completed task in the ledger becomes a **substate** — its brief gives the title, its report gives status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`), commits, and changed files.
2. The spec's `.annotations.json` sidecar is matched against task text — each provenance entry attaches to the task that implemented it. **Unmatched entries are dropped and counted, never guessed onto a plausible task** — the miss rate is reported as `annotationCoverage` rather than hidden.
3. Substates cluster into 2–5 **states** — the one generative step, naming what a group of tasks accomplished, not restating the task list.
4. The whole payload plus the consent block is sent via the `publish_graph` tool.

### What it looks like once stored

Every substate carries denormalized `humanCount` / `aiCount` / `groundedCount` tallies, computed once at publish time from its sources. The portal's canvas colors each container from that mix — never from a stored category, so the threshold can be retuned without a migration:

| Category | Rule | Reads as |
|---|---|---|
| human-led | human share ≥ 65% of (human + ai) | blue |
| ai-led | human share ≤ 35% | red |
| balanced | in between | purple |

The other four source types (`skill_doc`, `tool_output`, `existing_codebase`, `external_reference`) count toward `groundedCount` but never toward the red/blue axis — a grounded fact says nothing about who *decided* it belonged in the spec. The mix is also spelled out as text (`"HUMAN 1 · AI 4"`) alongside the color, since red/purple discrimination fails common color-vision deficiencies and the distinction is the entire point of the view.

Re-publishing the same spec path replaces its contents but preserves any rename or reorder the human has already done to that sheet's tab. `list_published_graphs` shows everything sent so far; `revoke_published_graph` deletes one sheet or an entire project, and the skill runs it the moment consent is withdrawn.

## What the MCP server actually is

Worth being precise here, since it's easy to conflate with the publishing flow above: `mcp-server/` is a separate, **read-only** service. It serves the 14 skills' `SKILL.md` content as MCP prompts and resources over Streamable HTTP, bearer-token authenticated against the account portal's user database — so a teammate on VS Code, Cursor, or a CI agent can pull the same skill library without installing the plugin locally.

It does not execute code, does not touch a workspace, and on its own records nothing about a session. The `publish_graph` / `list_published_graphs` / `revoke_published_graph` tools do live in this server's codebase (`mcp-server/src/graphs.ts`) and write to the same Postgres instance — but they are only ever called by the `subagent-driven-development` skill, only after the consent gate above, never as a side effect of just having the server connected.

## graphify: a different graph entirely

One more disambiguation: this repo also ships **graphify**, which builds `graphify-out/graph.json` — a knowledge graph of the *codebase itself* (files, functions, community structure), used for fast Q&A about the code. It is a general-purpose tool, unrelated to human/AI collaboration tracking, and it's what the `tool_output` provenance source refers to when a requirement is grounded in a `graphify explain` / `graphify query` result during brainstorming.

## Reading this for your own human–AI collaboration model

If the goal is designing an analogous process for another project, the load-bearing ideas — independent of this specific implementation — are:

- **Gate creative work behind explicit approval, twice** — once on the in-chat presentation, once on the written artifact. Nothing downstream trusts a design that only exists as a conversation.
- **Tag provenance at the sentence level, at write time** — not reconstructed later from memory or transcript mining. The taxonomy only needs to answer one question per requirement: whose call was this?
- **Separate "what was recorded" from "what was sent."** The sidecar is written locally and unconditionally; the publish step is a distinct, opt-in, per-field-scoped action with its own consent artifact.
- **Make the audit trail honest about its own limits.** The server here states outright that it cannot verify the consent file matches reality — it's an accountability record, not enforcement. Unmatched provenance is dropped and counted, never guessed.
- **Keep the recording mechanism decoupled from the review mechanism.** Code review (task reviewer, final reviewer) governs correctness; provenance tagging governs attribution. They share no gate — a fully AI-assumed requirement can still pass review, and a human-sourced one can still fail it.

---

Sourced directly from this checkout: `skills/brainstorming/SKILL.md`, `skills/writing-plans/SKILL.md`, `skills/subagent-driven-development/{SKILL.md,publishing-graphs.md}`, `skills/finishing-a-development-branch/SKILL.md`, `mcp-server/{README.md,src/graphs.ts}`, `web/prisma/schema.prisma`, `web/src/lib/graph-color.ts`, and `docs/governed-superpowers/specs/2026-07-30-requirement-provenance-tagging-design.md`. No claims here go beyond what those files state.
