#!/usr/bin/env bash
# sdd-publish must bundle regardless of consent: the local graph build depends
# on its output, and consent now lives in `sdd-graph payload`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPT_UNDER_TEST="$REPO_ROOT/skills/subagent-driven-development/scripts/sdd-publish"

FAILURES=0
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

pass() {
  echo "  [PASS] $1"
}

fail() {
  echo "  [FAIL] $1"
  FAILURES=$((FAILURES + 1))
}

assert_contains() {
  if printf '%s' "$1" | grep -Fq -- "$2"; then
    pass "$3"
  else
    fail "$3 (expected output to contain: $2)"
  fi
}

assert_not_contains() {
  if printf '%s' "$1" | grep -Fq -- "$2"; then
    fail "$3 (expected output NOT to contain: $2)"
  else
    pass "$3"
  fi
}

# A throwaway repo with one plan referencing one spec, and one commit.
setup_project() {
  PROJECT="$TEST_ROOT/project"
  rm -rf "$PROJECT"
  mkdir -p "$PROJECT/docs"
  (
    cd "$PROJECT"
    git init -q
    git config user.email "test@example.com"
    git config user.name "Test"
    printf '# Plan\n\n**Reference spec:** `docs/a-design.md`\n' > docs/plan.md
    git add .
    git commit -qm "initial"
  )
}

run_publish() {
  (cd "$PROJECT" && "$SCRIPT_UNDER_TEST" docs/plan.md 2>&1)
}

write_sharing() {
  mkdir -p "$PROJECT/.governed-superpowers"
  printf '{"revokedAt": %s}\n' "$1" > "$PROJECT/.governed-superpowers/sharing.json"
}

echo "sdd-publish bundles regardless of consent"

setup_project
OUTPUT="$(run_publish)"
assert_contains "$OUTPUT" "# Publish bundle: plan.md" "bundles with no consent file at all"
assert_not_contains "$OUTPUT" "skipped:" "does not skip with no consent file"
assert_contains "$OUTPUT" "docs/a-design.annotations.json (does not exist)" "reports the sidecar's absence"
assert_contains "$OUTPUT" "# 0 completed task(s) bundled" "reports an empty ledger honestly"

setup_project
write_sharing "null"
assert_contains "$(run_publish)" "# Publish bundle: plan.md" "bundles with unrevoked consent"

setup_project
write_sharing '"2026-08-02T09:00:00Z"'
OUTPUT="$(run_publish)"
assert_contains "$OUTPUT" "# Publish bundle: plan.md" "bundles even when consent is revoked"
assert_not_contains "$OUTPUT" "skipped:" "does not skip when consent is revoked"

if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES failure(s)"
  exit 1
fi
echo "all passed"
