# Real-Time Collaboration Graph Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Reference spec:** `docs/governed-superpowers/specs/2026-08-02-realtime-collaboration-graph-publishing-design.md`

**Goal:** Move the collaboration-graph consent gate from the end of `subagent-driven-development` to its start, and publish live after every completed task instead of once at the end.

**Architecture:** A new mechanical helper script, `scripts/sdd-publish`, bundles raw per-task material (commit range, brief/report paths, diff stat) from the ledger on each call and re-checks consent every time; it never interprets that material. The controlling agent — not the script — reads the bundle, extracts status, matches annotations, clusters states, and calls `publish_graph`, exactly as it already does today, just at a per-task cadence starting from Setup instead of once at Finish.

**Tech Stack:** Bash (matching the existing `sdd-workspace` / `task-brief` / `review-package` scripts), Markdown skill-prose edits (`SKILL.md`, `publishing-graphs.md`), no new dependencies.

**Global Constraints:**
- Zero new third-party dependencies (project-wide rule; the script must use only `bash`, `git`, `grep`, `sed` — no `jq` or similar).
- `scripts/sdd-publish` must never read or write `.governed-superpowers/sharing.json`'s content beyond checking `revokedAt`, and must never write to it at all.
- `scripts/sdd-publish` must never call `publish_graph`, never open `task-N-brief.md`/`task-N-report.md` content, never match annotations, and never cluster — see the spec's "Script scope" correction for why.
- Every skill-prose edit must preserve existing surrounding content exactly except for the specific insertion/removal described in its task.

---

## File Structure

- **Create:** `skills/subagent-driven-development/scripts/sdd-publish` — new bash script, bundles raw per-task material for a live publish call.
- **Create:** `tests/claude-code/test-sdd-publish.sh` — tests for the new script, following the existing `test-sdd-workspace.sh` pattern (temp git repo, `pass`/`fail` helpers).
- **Modify:** `tests/claude-code/run-skill-tests.sh` — register the new test file in the `tests` array.
- **Modify:** `skills/subagent-driven-development/SKILL.md` — add the live-consent gate to Setup, add a per-task publish step to "Complete the task" and the process diagram, remove the end-of-plan publish offer from Finish.
- **Modify:** `skills/subagent-driven-development/publishing-graphs.md` — reword the consent prompt for a live feed, rewrite "Assembling the payload" for the script/agent split and per-task cadence, add one red-flags row.

---

### Task 1: `scripts/sdd-publish` and its tests

**Files:**
- Create: `skills/subagent-driven-development/scripts/sdd-publish`
- Create: `tests/claude-code/test-sdd-publish.sh`

- [ ] **Step 1: Write the failing test**

Create `tests/claude-code/test-sdd-publish.sh`:

```bash
#!/usr/bin/env bash
# Tests for scripts/sdd-publish: it bundles raw per-task material (commit
# range, brief/report paths, diff stat) from a plan's ledger for a live
# collaboration-graph publish, re-checking .governed-superpowers/sharing.json
# consent on every call. It never interprets brief/report content, never
# matches annotations, and never calls publish_graph.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SDD_SCRIPTS="$REPO_ROOT/skills/subagent-driven-development/scripts"

FAILURES=0
TEST_ROOT=""

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

cleanup() {
    if [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]]; then
        rm -rf "$TEST_ROOT"
    fi
}

write_sharing_json() {
    local path="$1" revoked="$2"
    mkdir -p "$(dirname "$path")"
    cat > "$path" <<JSON
{
  "version": 1,
  "project": { "slug": "t", "name": "T", "originHash": "sha256:abc" },
  "scope": { "specPaths": true, "substateTitles": true, "changePaths": true, "annotationText": true },
  "grantedAt": "2026-08-02T00:00:00Z",
  "grantedBy": "human partner, in session",
  "revokedAt": $revoked
}
JSON
}

main() {
    echo "=== Test: sdd-publish ==="

    TEST_ROOT="$(mktemp -d)"
    trap cleanup EXIT

    git init -q -b main "$TEST_ROOT/repo"
    local repo
    repo="$(cd "$TEST_ROOT/repo" && git rev-parse --show-toplevel)"
    local git_id=(-c user.email=t@example.com -c user.name=t -c commit.gpgsign=false)

    cat > "$repo/plan-a.md" <<'PLAN'
# Plan A

**Reference spec:** `docs/governed-superpowers/specs/2026-08-02-example-design.md`

## Task 1: First thing

Do the first thing.
PLAN
    ( cd "$repo" && git "${git_id[@]}" add plan-a.md && git "${git_id[@]}" commit -qm c0 )

    # --- argument validation ---
    local rc=0
    (cd "$repo" && "$SDD_SCRIPTS/sdd-publish" >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "sdd-publish without a plan errors with exit 2"
    else
        fail "sdd-publish without a plan errors with exit 2"
        echo "    exit: $rc"
    fi

    rc=0
    (cd "$repo" && "$SDD_SCRIPTS/sdd-publish" no-such-plan.md >/dev/null 2>&1) || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "sdd-publish with a missing plan file errors with exit 2"
    else
        fail "sdd-publish with a missing plan file errors with exit 2"
        echo "    exit: $rc"
    fi

    # --- no sharing.json: skip, exit 0 ---
    local out
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)"
    if [[ "$out" == *"skipped"* && "$out" != *"## Task"* ]]; then
        pass "no sharing.json: skips silently, no task bundle"
    else
        fail "no sharing.json: skips silently, no task bundle"
        echo "    got: $out"
    fi

    # --- revoked sharing.json: skip, exit 0 ---
    write_sharing_json "$repo/.governed-superpowers/sharing.json" '"2026-08-02T01:00:00Z"'
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)"
    if [[ "$out" == *"skipped"* && "$out" != *"## Task"* ]]; then
        pass "revoked sharing.json: skips silently, no task bundle"
    else
        fail "revoked sharing.json: skips silently, no task bundle"
        echo "    got: $out"
    fi

    # --- active consent, no ledger yet: 0 tasks bundled, no error ---
    write_sharing_json "$repo/.governed-superpowers/sharing.json" 'null'
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)"
    if [[ "$out" == *"0 completed task(s) bundled"* && "$out" != *"## Task"* ]]; then
        pass "active consent, no ledger: 0 tasks bundled"
    else
        fail "active consent, no ledger: 0 tasks bundled"
        echo "    got: $out"
    fi

    # --- sidecar path resolution: does not exist ---
    if [[ "$out" == *"design.annotations.json (does not exist)"* ]]; then
        pass "prints sidecar path, marked does-not-exist when absent"
    else
        fail "prints sidecar path, marked does-not-exist when absent"
        echo "    got: $out"
    fi

    mkdir -p "$repo/docs/governed-superpowers/specs"
    printf '{}\n' > "$repo/docs/governed-superpowers/specs/2026-08-02-example-design.annotations.json"
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)"
    if [[ "$out" == *"design.annotations.json (exists)"* ]]; then
        pass "prints sidecar path, marked exists when present"
    else
        fail "prints sidecar path, marked exists when present"
        echo "    got: $out"
    fi

    # --- one completed task: bundled with commit range, paths, diff stat ---
    ( cd "$repo" \
        && printf 'y\n' > f && git "${git_id[@]}" add f && git "${git_id[@]}" commit -qm c1 )
    local base head
    base="$(cd "$repo" && git rev-parse --short HEAD~1)"
    head="$(cd "$repo" && git rev-parse --short HEAD)"

    local dir
    dir="$(cd "$repo" && "$SDD_SCRIPTS/sdd-workspace" plan-a.md)"
    cat > "$dir/progress.md" <<LEDGER
# SDD ledger — plan: plan-a.md
Task 1: complete (commits ${base}..${head}, review clean)
LEDGER

    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)"
    if [[ "$out" == *"## Task 1"* && "$out" == *"Commits: ${base}..${head}"* ]]; then
        pass "completed task: bundled with correct commit range"
    else
        fail "completed task: bundled with correct commit range"
        echo "    got: $out"
    fi

    if [[ "$out" == *"Brief: $dir/task-1-brief.md"* && "$out" == *"Report: $dir/task-1-report.md"* ]]; then
        pass "completed task: bundled with correct brief/report paths"
    else
        fail "completed task: bundled with correct brief/report paths"
        echo "    got: $out"
    fi

    if [[ "$out" == *"Diff stat:"* && "$out" == *" f "* ]]; then
        pass "completed task: bundled with diff --stat output"
    else
        fail "completed task: bundled with diff --stat output"
        echo "    got: $out"
    fi

    if [[ "$out" == *"1 completed task(s) bundled"* ]]; then
        pass "completed task: count reflects one bundled task"
    else
        fail "completed task: count reflects one bundled task"
        echo "    got: $out"
    fi

    # --- "K parked" completion variant is also bundled ---
    cat > "$dir/progress.md" <<LEDGER
# SDD ledger — plan: plan-a.md
Task 1: complete (commits ${base}..${head}, 2 parked)
LEDGER
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)"
    if [[ "$out" == *"## Task 1"* ]]; then
        pass "parked-at-cap completion line is bundled too"
    else
        fail "parked-at-cap completion line is bundled too"
        echo "    got: $out"
    fi

    echo ""
    if [[ "$FAILURES" -ne 0 ]]; then
        echo "FAILED: $FAILURES assertion(s)."
        exit 1
    fi
    echo "PASS"
}

main "$@"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `chmod +x tests/claude-code/test-sdd-publish.sh && bash tests/claude-code/test-sdd-publish.sh`
Expected: FAIL — `scripts/sdd-publish` does not exist yet, so calls like `"$SDD_SCRIPTS/sdd-publish"` produce "No such file or directory" and every assertion fails.

- [ ] **Step 3: Write the minimal implementation**

Create `skills/subagent-driven-development/scripts/sdd-publish`:

```bash
#!/usr/bin/env bash
# Bundle raw per-task material for a live collaboration-graph publish: for
# every completed task in the plan's ledger, print its commit range, its
# brief/report file paths, and a `git diff --stat` over that range. Also
# print the spec's annotations sidecar path if one exists, without opening
# it. The controlling agent interprets this bundle -- reading status,
# matching annotations, clustering into states -- and calls publish_graph
# itself; this script never does any of that.
#
# Consent is re-checked on every call: if .governed-superpowers/sharing.json
# is missing or its revokedAt is set, this prints one line and exits 0
# without bundling anything, so a mid-plan revocation takes effect on the
# very next call, not the next plan.
#
# Usage: sdd-publish PLAN_FILE
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: sdd-publish PLAN_FILE" >&2
  exit 2
fi

plan=$1
[ -f "$plan" ] || { echo "no such plan file: $plan" >&2; exit 2; }

root=$(git rev-parse --show-toplevel)
sharing="$root/.governed-superpowers/sharing.json"

if [ ! -f "$sharing" ]; then
  echo "skipped: no .governed-superpowers/sharing.json -- no active consent"
  exit 0
fi

revoked=$(grep -o '"revokedAt"[[:space:]]*:[[:space:]]*[^,}]*' "$sharing" \
  | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '[:space:]')
if [ "$revoked" != "null" ]; then
  echo "skipped: sharing.json revokedAt is set -- consent revoked"
  exit 0
fi

dir=$("$(cd "$(dirname "$0")" && pwd)/sdd-workspace" "$plan")

echo "# Publish bundle: $(basename "$plan")"
echo

spec_line=$(grep -m1 '^\*\*Reference spec:\*\*' "$plan" || true)
if [ -n "$spec_line" ]; then
  spec_path=$(echo "$spec_line" \
    | sed 's/^\*\*Reference spec:\*\*[[:space:]]*//' \
    | tr -d '`' | sed 's/[[:space:]]*$//')
  sidecar="${spec_path%.md}.annotations.json"
  echo "## Annotations sidecar"
  if [ -f "$root/$sidecar" ]; then
    echo "$sidecar (exists)"
  else
    echo "$sidecar (does not exist)"
  fi
  echo
fi

ledger="$dir/progress.md"
count=0
if [ -f "$ledger" ]; then
  while IFS= read -r line; do
    if [[ "$line" =~ ^Task\ ([0-9]+):\ complete\ \(commits\ ([0-9a-f]+)\.\.([0-9a-f]+), ]]; then
      n="${BASH_REMATCH[1]}"
      base="${BASH_REMATCH[2]}"
      head="${BASH_REMATCH[3]}"
      echo "## Task $n"
      echo "Commits: ${base}..${head}"
      echo "Brief: $dir/task-${n}-brief.md"
      echo "Report: $dir/task-${n}-report.md"
      echo "Diff stat:"
      git diff --stat "${base}..${head}"
      echo
      count=$((count + 1))
    fi
  done < "$ledger"
fi

echo "# $count completed task(s) bundled"
```

Then make it executable: `chmod +x skills/subagent-driven-development/scripts/sdd-publish`

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash tests/claude-code/test-sdd-publish.sh`
Expected: PASS — every assertion above prints `[PASS]`, ending with `PASS`.

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/scripts/sdd-publish tests/claude-code/test-sdd-publish.sh
git commit -m "feat: add sdd-publish script for live collaboration-graph bundling"
```

---

### Task 2: Register the new test in the runner

**Files:**
- Modify: `tests/claude-code/run-skill-tests.sh:76-80`

- [ ] **Step 1: Add `test-sdd-publish.sh` to the fast test list**

In `tests/claude-code/run-skill-tests.sh`, find:

```bash
tests=(
    "test-worktree-path-policy.sh"
    "test-sdd-workspace.sh"
    "test-subagent-driven-development.sh"
)
```

Replace with:

```bash
tests=(
    "test-worktree-path-policy.sh"
    "test-sdd-workspace.sh"
    "test-sdd-publish.sh"
    "test-subagent-driven-development.sh"
)
```

- [ ] **Step 2: Run the suite to verify the new test is picked up**

Run: `cd tests/claude-code && bash run-skill-tests.sh --test test-sdd-publish.sh`
Expected: PASS, with `Passed: 1` / `Failed: 0` in the summary (this invokes the file directly via `--test`, so it does not require the `claude` CLI to succeed beyond its own startup check — if `claude` is unavailable in this environment, run `bash test-sdd-publish.sh` directly instead and confirm it still prints `PASS`).

- [ ] **Step 3: Commit**

```bash
git add tests/claude-code/run-skill-tests.sh
git commit -m "test: register test-sdd-publish.sh in the skill test runner"
```

---

### Task 3: Move the consent gate to Setup and publish a skeleton sheet

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md:139-142`

- [ ] **Step 1: Insert the live-consent subsection into Setup**

In `skills/subagent-driven-development/SKILL.md`, find:

```markdown
- `git clean -fdx` will destroy the workspace (it's git-ignored scratch); if
  that happens, recover from `git log`.

Read the plan once, note its context and Global Constraints, and create a
todo per task.
```

Replace with:

```markdown
- `git clean -fdx` will destroy the workspace (it's git-ignored scratch); if
  that happens, recover from `git log`.

### Live collaboration graph consent

Once the ledger exists, check `.governed-superpowers/sharing.json`. If it is
missing, or its `revokedAt` is not null, stop and ask your human partner,
verbatim:

> "I can publish this plan's collaboration graph to your Governed-Superpowers
> account as it happens — a live diagram of what's getting built and which
> parts trace back to your input versus my own assumptions, updating after
> every completed task. It would send: the spec's path, the task titles from
> this plan, the files each task changed, and the requirement text from the
> spec's annotations sidecar. Want me to?"

Read [publishing-graphs.md](publishing-graphs.md) before asking — it covers
the consent-file schema, the four per-field scope flags, and why a hedged
answer is not consent for `annotationText`. Write `sharing.json` only on a
clear yes. If they decline, say nothing further and do not ask again this
session.

On a clear yes, run `scripts/sdd-publish PLAN_FILE`, then call `publish_graph`
with a skeleton payload (project identity and spec path, zero substates,
zero states) — this puts the sheet in the portal before Task 1 dispatches, so
your human partner can open it immediately.

Read the plan once, note its context and Global Constraints, and create a
todo per task.
```

- [ ] **Step 2: Verify the file still parses as valid Markdown with no broken links**

Run: `grep -n "publishing-graphs.md" skills/subagent-driven-development/SKILL.md`
Expected: the link appears twice — once in the new Setup subsection, once later in the file (the existing Finish-section reference, addressed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md
git commit -m "docs: move collaboration-graph consent gate to SDD setup"
```

---

### Task 4: Publish after every completed task

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md:47-107` (process diagram)
- Modify: `skills/subagent-driven-development/SKILL.md` (Step 5, "Complete the task" section)

- [ ] **Step 1: Add a publish node to the process diagram**

In `skills/subagent-driven-development/SKILL.md`, find:

```
    "Park findings in ledger with rulings" -> "Append completion to ledger, mark todo complete";
    "Append completion to ledger, mark todo complete" -> "More tasks remain?";
```

Replace with:

```
    "Park findings in ledger with rulings" -> "Append completion to ledger, mark todo complete";
    "Append completion to ledger, mark todo complete" -> "Publish graph update (if consent active)";
    "Publish graph update (if consent active)" -> "More tasks remain?";
```

Then find the node-declarations block near the top of the same `dot` diagram:

```
        "Adjudicate each open finding" [shape=box];
        "Any load-bearing finding?" [shape=diamond];
        "STOP: report BLOCKED to human partner" [shape=box];
        "Park findings in ledger with rulings" [shape=box];
        "Append completion to ledger, mark todo complete" [shape=box];
    }
```

Replace with:

```
        "Adjudicate each open finding" [shape=box];
        "Any load-bearing finding?" [shape=diamond];
        "STOP: report BLOCKED to human partner" [shape=box];
        "Park findings in ledger with rulings" [shape=box];
        "Append completion to ledger, mark todo complete" [shape=box];
        "Publish graph update (if consent active)" [shape=box];
    }
```

- [ ] **Step 2: Add the publish instruction to "Complete the task"**

In `skills/subagent-driven-development/SKILL.md`, find:

```markdown
- `Task <N>: complete (commits <base7>..<head7>, review clean)`
- `Task <N>: complete (commits <base7>..<head7>, <K> parked)` after a
  tripped breaker

Then mark the todo complete and move on. Never move to the next task while
the review has open Critical/Important issues that are neither fixed nor
parked-with-ruling at the cap.
```

Replace with:

```markdown
- `Task <N>: complete (commits <base7>..<head7>, review clean)`
- `Task <N>: complete (commits <base7>..<head7>, <K> parked)` after a
  tripped breaker

If graph consent is active (`.governed-superpowers/sharing.json` present
and not revoked), run `scripts/sdd-publish PLAN_FILE`, interpret the printed
bundle into substates and states per
[publishing-graphs.md](publishing-graphs.md), and call `publish_graph` with
the full accumulated payload. If `sdd-publish` reports it skipped (consent
missing or revoked), do not call `publish_graph`. If the `publish_graph`
call itself fails, note it in this task's ledger line ("graph publish
failed: `<reason>`") and continue — a publish failure is never a reason to
stop or retry a task.

Then mark the todo complete and move on. Never move to the next task while
the review has open Critical/Important issues that are neither fixed nor
parked-with-ruling at the cap.
```

- [ ] **Step 3: Verify the diagram still has balanced braces**

Run: `grep -c '{' skills/subagent-driven-development/SKILL.md; grep -c '}' skills/subagent-driven-development/SKILL.md`
Expected: both counts equal (the edit added one node line but no new brace).

- [ ] **Step 4: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md
git commit -m "docs: publish collaboration graph after every completed task"
```

---

### Task 5: Remove the end-of-plan publish offer

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md:416-431`

- [ ] **Step 1: Delete the end-of-plan offer paragraph**

In `skills/subagent-driven-development/SKILL.md`, find:

```markdown
## Finish

When the final whole-branch review is clean and its fixes are merged,
delete this plan's workspace (`rm -rf <workspace>`) — the git history is
the record now. Sibling directories belong to other plans; leave them
alone.

Before handing off, offer to publish this plan's collaboration graph to
the account portal. Check `.governed-superpowers/sharing.json`: if it is
missing or revoked, ask your human partner whether to share this
project's graph, and write the file only on a clear yes. Never publish
without it. If they decline, say nothing further and move on.

Read [publishing-graphs.md](publishing-graphs.md) before you publish.

Use governed-superpowers:finishing-a-development-branch.
```

Replace with:

```markdown
## Finish

When the final whole-branch review is clean and its fixes are merged,
delete this plan's workspace (`rm -rf <workspace>`) — the git history is
the record now. Sibling directories belong to other plans; leave them
alone. The collaboration graph, if consent was active, is already current
from the last per-task publish call — there is nothing left to publish
here.

Use governed-superpowers:finishing-a-development-branch.
```

- [ ] **Step 2: Verify no dangling reference remains**

Run: `grep -n "offer to publish" skills/subagent-driven-development/SKILL.md`
Expected: no output (the phrase no longer appears anywhere in the file).

- [ ] **Step 3: Commit**

```bash
git add skills/subagent-driven-development/SKILL.md
git commit -m "docs: remove end-of-plan publish offer, now handled live"
```

---

### Task 6: Update publishing-graphs.md for the script/agent split and live cadence

**Files:**
- Modify: `skills/subagent-driven-development/publishing-graphs.md`

- [ ] **Step 1: Reword the opening description and consent prompt**

In `skills/subagent-driven-development/publishing-graphs.md`, find:

```markdown
# Publishing a collaboration graph

After a plan is finished, the work it produced can be published to the
account portal, where it renders as one sheet in the Graphs view: a few
containers (coherent chunks of the spec), each holding circles (the tasks
that delivered them), coloured by where the requirements came from.

This is opt-in, per project, and your human partner owns the decision.

## Consent comes first

Read `.governed-superpowers/sharing.json` from the project root. If it is
missing, or its `revokedAt` is not null, **stop and ask** before doing
anything else:

> I can publish this plan's collaboration graph to your Governed-Superpowers
> account — a diagram of what got built and which parts trace back to your
> input versus my own assumptions. It would send: the spec's path, the task
> titles from this plan, the files each task changed, and the requirement
> text from the spec's annotations sidecar. Want me to?

Write the file only on a clear yes. "Sure, whatever" is not a yes to
sending requirement text — if the answer is hedged, ask which parts they
are comfortable with and set the scope flags accordingly.
```

Replace with:

```markdown
# Publishing a collaboration graph

From the start of `subagent-driven-development`, the work a plan produces
can be published live to the account portal, where it renders as one sheet
in the Graphs view: a few containers (coherent chunks of the spec), each
holding circles (the tasks that delivered them), coloured by where the
requirements came from. The sheet updates after every completed task, not
just once at the end.

This is opt-in, per project, and your human partner owns the decision.

## Consent comes first

This check happens twice: once at SDD Setup, before Task 1 dispatches, and
again automatically inside `scripts/sdd-publish` before every later publish
call — a mid-plan revocation must stop the very next update, not just the
next plan.

Read `.governed-superpowers/sharing.json` from the project root. If it is
missing, or its `revokedAt` is not null, **stop and ask** before doing
anything else:

> I can publish this plan's collaboration graph to your Governed-Superpowers
> account as it happens — a live diagram of what's getting built and which
> parts trace back to your input versus my own assumptions, updating after
> every completed task. It would send: the spec's path, the task titles
> from this plan, the files each task changed, and the requirement text
> from the spec's annotations sidecar. Want me to?

Write the file only on a clear yes. "Sure, whatever" is not a yes to
sending requirement text — if the answer is hedged, ask which parts they
are comfortable with and set the scope flags accordingly.
```

- [ ] **Step 2: Rewrite "Assembling the payload" for the script/agent split**

In `skills/subagent-driven-development/publishing-graphs.md`, find:

```markdown
## Assembling the payload

1. `scripts/sdd-workspace <plan>` → the workspace. Read `progress.md`.
   Each `Task <N>: complete` line is one **substate**, key `task-N`, in
   ledger order.
2. For each completed task, read `task-N-brief.md` for its title and
   `task-N-report.md` for its status (`DONE` / `DONE_WITH_CONCERNS` /
   `BLOCKED`), commits, changed paths, and notes.
3. Find the plan's `**Reference spec:**` line, then look for
   `<spec>.annotations.json` beside that spec. For each entry, match its
   verbatim `text` against the task briefs and reports to find the task
   that implemented it, and attach it to that substate as a source.
   - Entries you cannot confidently match are **dropped and counted**, never
     reassigned to a plausible-looking task. Report the tally in
     `annotationCoverage` so a bad match rate is visible instead of hidden
     behind a confident-looking colour.
   - **If the sidecar does not exist, publish anyway with no sources.** The
     graph still shows what was built; every container renders as "no
     provenance data", which is the honest answer.
4. Cluster the substates into 2–5 **states**. This is the one genuinely
   generative step: each state names what a group of tasks accomplished
   ("address auth in connection"), not what the individual tasks were.
   Substates keep their ledger order inside a state.
5. Call `publish_graph`.
```

Replace with:

```markdown
## Assembling the payload

Run this after the Setup skeleton call and again after every
`Task <N>: complete` ledger line (clean or parked-at-cap):

1. Run `scripts/sdd-publish <plan>`. It re-checks `sharing.json` for
   revocation (skipping silently if revoked), then prints a bundle: for
   every completed task, its commit range, the `task-N-brief.md` and
   `task-N-report.md` paths, and a `git diff --stat` over that range. It
   also prints the spec's `.annotations.json` sidecar path if one exists,
   without opening it. The script never interprets this material.
2. Read the bundle. For each task, read its brief and report to get the
   title and status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`); this is one
   **substate**, key `task-N`, in ledger order.
3. If the sidecar exists, match each entry's verbatim `text` against the
   task briefs and reports to find the task that implemented it, and attach
   it to that substate as a source.
   - Entries you cannot confidently match are **dropped and counted**, never
     reassigned to a plausible-looking task. Report the tally in
     `annotationCoverage` so a bad match rate is visible instead of hidden
     behind a confident-looking colour.
   - **If the sidecar does not exist, publish anyway with no sources.** The
     graph still shows what was built; every container renders as "no
     provenance data", which is the honest answer.
4. Cluster the substates into 2–5 **states**, from scratch, every call.
   This is the one genuinely generative step: each state names what a group
   of tasks accomplished ("address auth in connection"), not what the
   individual tasks were. Clusters are not sticky — an earlier grouping may
   no longer be the best name for it once later tasks add context, and
   that's fine. Substates keep their ledger order inside a state.
5. Call `publish_graph` with the full payload assembled from every
   completed task so far, not only the ones new since the last call — each
   call fully replaces the sheet's prior contents.
```

- [ ] **Step 3: Add a red-flags row for the re-check requirement**

In `skills/subagent-driven-development/publishing-graphs.md`, find:

```markdown
| "They only said no to the text, I'll send it blank" | A declined field is omitted. Don't send an empty shell of it. |
| "Low annotation coverage looks bad, I'll round up" | The number is the whole point. Report it as it is. |
```

Replace with:

```markdown
| "They only said no to the text, I'll send it blank" | A declined field is omitted. Don't send an empty shell of it. |
| "Low annotation coverage looks bad, I'll round up" | The number is the whole point. Report it as it is. |
| "I already asked at the start, no need to re-check sharing.json now" | Re-checked on every `scripts/sdd-publish` call — a mid-plan revoke must take effect on the very next task, not the next plan. |
```

- [ ] **Step 4: Verify no leftover references to the old once-at-the-end model**

Run: `grep -n "After a plan is finished" skills/subagent-driven-development/publishing-graphs.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/publishing-graphs.md
git commit -m "docs: describe live per-task publishing and the script/agent split"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the spec's `scripts/sdd-publish` component and its mechanical scope (footnotes 7, 11, 12, 13, 14). Task 3 covers the Setup consent move and skeleton publish (footnotes 2, 3, 4, 5). Task 4 covers per-task live updates (footnotes 6, 8, 9). Task 5 covers offer removal (footnote 10). Task 6 covers the reworded prompt and payload-assembly description (footnotes 3, 4, 6, 8, 9 as they surface in `publishing-graphs.md`). Task 2 is test-infrastructure only, not spec-derived.
- **No placeholders:** every step above has complete, runnable code or exact find/replace text — no "add appropriate handling" or "similar to Task N" language.
- **Type/name consistency:** `scripts/sdd-publish` is referenced identically (script name, argument `PLAN_FILE`, output phrasing "skipped:", "# N completed task(s) bundled") across Tasks 1, 3, 4, and 6.
