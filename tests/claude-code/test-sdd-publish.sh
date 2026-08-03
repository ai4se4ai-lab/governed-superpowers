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

    # --- malformed sharing.json (no revokedAt key at all): skip, exit 0 ---
    cat > "$repo/.governed-superpowers/sharing.json" <<'JSON'
{"version":1}
JSON
    rc=0
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)" || rc=$?
    if [[ "$rc" -eq 0 && "$out" == *"skipped"* ]]; then
        pass "sharing.json missing revokedAt key: skips silently, exit 0"
    else
        fail "sharing.json missing revokedAt key: skips silently, exit 0"
        echo "    exit: $rc"
        echo "    got: $out"
    fi

    # --- bad commit range in ledger: diff unavailable note, script still finishes ---
    write_sharing_json "$repo/.governed-superpowers/sharing.json" 'null'
    cat > "$dir/progress.md" <<LEDGER
# SDD ledger — plan: plan-a.md
Task 1: complete (commits ${base}..${head}, review clean)
Task 2: complete (commits deadbee0..deadbee1, review clean)
LEDGER
    rc=0
    out="$(cd "$repo" && "$SDD_SCRIPTS/sdd-publish" plan-a.md)" || rc=$?
    if [[ "$rc" -eq 0 && "$out" == *"(diff unavailable for deadbee0..deadbee1)"* && "$out" == *"2 completed task(s) bundled"* ]]; then
        pass "bad commit range: degrades gracefully, script still finishes"
    else
        fail "bad commit range: degrades gracefully, script still finishes"
        echo "    exit: $rc"
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
