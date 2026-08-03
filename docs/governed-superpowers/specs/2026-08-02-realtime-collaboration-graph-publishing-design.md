# Real-time collaboration graph publishing

## Problem

Today, the collaboration graph (spec requirements clustered into states/substates, coloured by provenance) is assembled and published exactly once, at the very end of `subagent-driven-development` — after the final whole-branch review, right before handing off to `finishing-a-development-branch`. A human partner who consents to publishing gets nothing to look at until the plan is entirely finished; they cannot watch the collaboration unfold, and they cannot see which parts of an in-progress plan are trending human-led versus AI-led until it's too late to redirect it.[^1]

## Design

### Consent moves to the start of the plan

The consent gate that currently lives in `subagent-driven-development`'s `Finish` section moves to **Setup**, immediately after the ledger is created and before Task 1 is dispatched.[^2] The check against `.governed-superpowers/sharing.json` is unchanged — missing or `revokedAt` not null means stop and ask — but the prompt itself is reworded to describe a live feed rather than a finished-work summary:[^3]

> "I can publish this plan's collaboration graph to your Governed-Superpowers account as it happens — a live diagram of what's getting built and which parts trace back to your input versus my own assumptions, updating after every completed task. It would send: the spec's path, the task titles from this plan, the files each task changed, and the requirement text from the spec's annotations sidecar. Want me to?"

The four `scope` flags (`specPaths`, `substateTitles`, `changePaths`, `annotationText`) and the rule that a hedged answer is not consent for `annotationText` carry over unchanged.[^4] The `sharing.json` schema itself does not change.

On a clear yes, an initial publish happens immediately — a skeleton sheet (project identity and spec path, zero substates, zero states) — so the sheet exists in the portal right away and the human can open it before Task 1 even starts.[^5]

### Per-task live updates

After every `Task <N>: complete` ledger line — whether the task finished clean or was parked-at-cap — the controlling agent runs `scripts/sdd-publish PLAN_FILE`, then interprets the printed bundle to build substates, match annotations, and cluster states, then calls `publish_graph`.[^6] The script's job is strictly mechanical; everything requiring judgment — reading a report's status, matching an annotation to a task, naming a cluster — is the agent's, same as it is today:

1. **Script:** re-checks `.governed-superpowers/sharing.json`. If revoked since the last call, it skips silently (prints one line, exits 0) — publishing is never load-bearing for the task loop, and a mid-plan revocation must take effect on the very next task, not the next plan.[^7]
2. **Script:** re-reads the whole ledger from scratch. For each `Task <N>: complete` (or parked-at-cap) line, prints the task number, the commit range parsed from the ledger line, the brief and report file paths, and `git diff --stat` for that commit range — the same raw-material bundling `review-package` already does for diffs, just for the whole ledger instead of one task's range.
3. **Script:** locates the plan's `**Reference spec:**` line and prints the matching `<spec>.annotations.json` path if it exists, or notes its absence. It does not open the sidecar or attempt to match entries — verbatim-text matching between a spec requirement and freeform task prose needs the same judgment as clustering, so it is not attempted mechanically.
4. **Agent:** reads the bundle and does all interpretation: each task's status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`) and changed files from its brief/report/diff-stat, and — if the sidecar exists — matches its entries against substates with the existing drop-and-count rule (an entry that cannot be confidently matched is dropped, never guessed, and counted into `annotationCoverage`).
5. **Agent:** clusters all substates into 2–5 states from scratch every time, the same generative step `publishing-graphs.md` already describes today — naming what each group of tasks accomplished. Clusters are not sticky: early-plan groupings may shift or be renamed as later tasks add context the first call didn't have.[^8]
6. **Agent:** calls `publish_graph` with the full accumulated payload, replacing the sheet's prior contents — the same "resend everything, no delta" model `publish_graph` already uses today, just invoked many times instead of once.[^9]

There is no new tool and no new consent artifact: the existing `publish_graph` / `sharing.json` machinery is reused at a finer call cadence.

### The end-of-plan offer is removed

`subagent-driven-development`'s `Finish` section currently says: "Before handing off, offer to publish this plan's collaboration graph to the account portal." That paragraph is deleted outright.[^10] Once live publishing has been running since Setup, the sheet is already current the moment the final review goes clean — there is nothing left to offer.

## Components

### `scripts/sdd-publish`

A new script alongside the existing `sdd-workspace`, `task-brief`, and `review-package` scripts, invoked as `scripts/sdd-publish PLAN_FILE`.[^11] It performs steps 1–3 above (consent re-check, per-task raw-material bundling, sidecar path lookup) and prints that bundle to a file for the controlling agent to interpret — mirroring how `review-package` prints a diff file for the agent to hand to a reviewer rather than dispatching the reviewer itself, `sdd-publish` prints raw material for the agent to judge and act on. It never opens or interprets brief/report content, never matches annotations, never clusters, and never calls `publish_graph`.[^12]

The script is stateless: every invocation is a fresh, full recompute from the ledger and sidecar path on disk. It never writes or reads any state of its own between calls, and it never touches `sharing.json` — that file is written only by the agent's own consent-gate step, never by this script.[^13]

## Data flow

1. **Setup.** Ledger created → consent check/ask → (if yes) `sharing.json` written → `scripts/sdd-publish` run once → skeleton `publish_graph` call.
2. **Per task.** Implementer dispatched → reviewed → fixed/parked as needed → ledger completion line appended → `scripts/sdd-publish` run → `publish_graph` call with the now-larger substate list.
3. **Finish.** Final whole-branch review goes clean → workspace deleted → handoff to `finishing-a-development-branch`. No publish step here anymore; the sheet is already current from the last per-task call.

## Error handling

- **No consent / revoked consent** at any `scripts/sdd-publish` call: skip silently, exit 0, one printed line. Never surfaces as a task-loop error and never blocks task completion.[^14]
- **`publish_graph` call itself fails** (network, auth, server error): the agent notes it as a one-line addition to that task's ledger bookkeeping ("graph publish failed: `<reason>`") and continues the task loop. Publishing failure is never a reason to stop or retry a task.
- **Annotation sidecar missing, or an entry unmatched**: unchanged from today — publish with no sources, or drop-and-count, respectively. Recomputed fresh on every call rather than once.

## Testing

This is a behavioral change to skill prose plus one small script, so it follows this project's existing bar for skill-content changes — eval evidence via `governed-superpowers:writing-skills`, not a unit-test suite, mirroring the testing approach used for the requirement-provenance-tagging change.[^15]

- **Script-level dry run**: against a fixed sample workspace (ledger + briefs/reports + annotations sidecar), confirm a skeleton call with zero completions prints an empty bundle; a second call after one completion prints that task's commit range, file paths, and diff stat correctly; a call against a revoked `sharing.json` produces the skip line and no bundle output.
- **Skill-level adversarial dry run**: run `subagent-driven-development` on a small real multi-task plan with consent granted at Setup, confirming a publish call fires after every task completion (not only the last), and that hand-editing `sharing.json` to set `revokedAt` between two task completions stops the very next call, not a later one.
- **Regression check**: confirm the existing end-to-end consent semantics (declined scope flags omitted, not blanked; declined consent means no further prompt this session) still hold when the ask happens at Setup instead of Finish.

[^1]: The collaboration graph is currently assembled and published exactly once, at the end of the plan, after the final whole-branch review.
[^2]: The consent check moves from the `Finish` section to `Setup`, immediately after the ledger is created and before Task 1 is dispatched.
[^3]: The consent prompt must describe a live, updating feed rather than a one-time finished-work summary.
[^4]: The four `scope` flags and the rule that a hedged answer is not consent for `annotationText` must carry over unchanged from the existing consent gate.
[^5]: On a clear yes, the agent must publish an initial skeleton sheet immediately, before Task 1 dispatches.
[^6]: After every `Task <N>: complete` ledger line, clean or parked-at-cap, the agent must run `scripts/sdd-publish`, interpret the printed bundle into substates and states, and call `publish_graph`.
[^7]: Each `scripts/sdd-publish` call must re-check `.governed-superpowers/sharing.json` for revocation and skip silently, without erroring the task loop, if consent has been revoked.
[^8]: State clustering must be recomputed from scratch by the agent on every publish call, not assigned once and left sticky.
[^9]: Each publish call must resend the full accumulated payload, replacing the sheet's prior contents, rather than sending an incremental delta.
[^10]: The existing end-of-plan publish offer in `subagent-driven-development`'s `Finish` section must be removed.
[^11]: A new script, `scripts/sdd-publish`, must be added alongside the existing `sdd-workspace`, `task-brief`, and `review-package` scripts.
[^12]: `scripts/sdd-publish` must print raw per-task material (commit range, file paths, diff stat) for the controlling agent to interpret, never opening or interpreting brief/report content, matching annotations, clustering, or calling `publish_graph` itself — the same division of labor `review-package` uses for diffs handed to a reviewer.
[^13]: `scripts/sdd-publish` must never read or write `.governed-superpowers/sharing.json` itself; only the agent's own consent-gate step may write it.
[^14]: A `scripts/sdd-publish` call made without active consent must skip silently and exit 0, never surfacing as a task-loop error.
[^15]: This change must be verified via eval evidence and manual dry runs, per this project's existing bar for skill-content changes, not via an automated unit-test suite.
