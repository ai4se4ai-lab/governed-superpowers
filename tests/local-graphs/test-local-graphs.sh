#!/usr/bin/env bash
# Runs the local collaboration-graph store's unit and CLI tests. The suite
# itself uses Node's built-in test runner - no dependencies, matching the CLI
# it exercises. This wrapper exists so the suite is discoverable alongside the
# repo's other tests/**/test-*.sh entry points.
set -euo pipefail

# Discovery is driven from the working directory, not from a path argument:
# on Node 22 (verified v22.18.0 on Windows) `node --test <dir>` tries to LOAD
# the directory as a module and dies with MODULE_NOT_FOUND. Running from
# inside the directory makes Node discover *.test.mjs itself, with no shell
# glob to expand and no path separator differences to trip over.
cd "$(dirname "$0")"

exec node --test
