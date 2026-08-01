# GCP + Supabase Deploy Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scripted support for running this stack against a Supabase-hosted Postgres instead of the bundled container, and for deploying `web` + `mcp-server` to Google Cloud Run — mirroring the ergonomics of a sibling project's `docker-up.ps1 --db local|cloud` and `gcp-deploy.py`, adapted to this repo's actual Prisma/Postgres/SMTP architecture.

**Architecture:** No new runtime code paths. `DATABASE_URL` already works with any Postgres-compatible connection string; Supabase support is just wiring a second, direct connection string (`DIRECT_URL`, sourced from `SUPABASE_DB_URL`) through for Prisma migrations, which pgbouncer's pooled connection can't run. Two new orchestration scripts (`docker-up.{ps1,sh}`, `gcp-deploy.py`) wrap existing `docker compose` / `gcloud` / `docker build` commands — they contain no new business logic, only config resolution and command sequencing.

**Tech Stack:** PowerShell 5.1, POSIX shell (bash), Python 3 (stdlib only — `argparse`, `subprocess`, `os`, `unittest`), Prisma, Docker Compose, `gcloud` CLI.

**Spec:** `docs/superpowers/specs/2026-08-01-gcp-supabase-deploy-tooling-design.md`

---

## Task 1: `DIRECT_URL` plumbing for Supabase migrations

**Files:**
- Modify: `web/prisma/schema.prisma:13-16`
- Modify: `docker-compose.yml:25-37` (the `migrate` service)
- Modify: `.env.example`

- [ ] **Step 1: Add `directUrl` to the Prisma datasource**

Edit `web/prisma/schema.prisma`, in the `datasource db` block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- [ ] **Step 2: Verify the schema still parses**

Run: `cd web && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Note: this requires `DATABASE_URL` and `DIRECT_URL` to be *set* (any value, they don't need to be reachable) — `npx prisma validate` only checks the env var exists, not that it connects. If it fails with `Environment variable not found: DIRECT_URL`, export a placeholder first: `export DATABASE_URL=postgresql://x:x@localhost:5432/x DIRECT_URL=postgresql://x:x@localhost:5432/x` (PowerShell: `$env:DATABASE_URL = "postgresql://x:x@localhost:5432/x"; $env:DIRECT_URL = $env:DATABASE_URL`).

- [ ] **Step 3: Require `DIRECT_URL` on the `migrate` service**

Edit `docker-compose.yml`, the `migrate` service's `environment` block (currently only `DATABASE_URL`):

```yaml
  migrate:
    build:
      context: ./web
      dockerfile: Dockerfile
      target: migrator
    environment:
      - DATABASE_URL=${DATABASE_URL:?Set DATABASE_URL in .env - see .env.example}
      - DIRECT_URL=${DIRECT_URL:?Set DIRECT_URL in .env - see .env.example}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - mcp
    restart: "no"
```

- [ ] **Step 4: Document the new vars in `.env.example`**

Edit `.env.example`, replace the `# ---------------------------------------------------------------- database` section:

```
# ---------------------------------------------------------------- database
# 'postgres' (default, bundled container) or 'supabase' (hosted Postgres).
# Documentation only - nothing in the app branches on this; it only changes
# which values you fill in below and which scripts/docker-up.* flag you use.
DB_PROVIDER=postgres

POSTGRES_USER=governed
# Generate with: openssl rand -hex 24
POSTGRES_PASSWORD=
POSTGRES_DB=governed

# Used by both the portal and mcp-server. Must match the three values above
# for DB_PROVIDER=postgres. The host is the compose service name, not
# localhost.
DATABASE_URL=postgresql://governed:CHANGE_ME@db:5432/governed

# Migrations need a direct (non-pooled) connection - Prisma's migration
# engine doesn't work through pgbouncer's transaction-mode pooling. For
# DB_PROVIDER=postgres this is the same value as DATABASE_URL (no pooler
# locally); scripts/docker-up.* sets it for you. For DB_PROVIDER=supabase
# this MUST be different from DATABASE_URL - see below.
# DIRECT_URL=

# ---------------------------------------------------------------- supabase (DB_PROVIDER=supabase only)
# Supabase Dashboard > Settings > Database > Connection string.
# DATABASE_URL above = the "Transaction pooler" string (port 6543) - the app's
# runtime connection. SUPABASE_DB_URL = the "Direct connection" string (port
# 5432) - migrations only. scripts/docker-up.* --db cloud reads this and sets
# DIRECT_URL to it automatically.
# SUPABASE_DB_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

- [ ] **Step 5: Commit**

```bash
git add web/prisma/schema.prisma docker-compose.yml .env.example
git commit -m "feat: add DIRECT_URL for Supabase-compatible Prisma migrations"
```

---

## Task 2: `scripts/docker-up.ps1`

**Files:**
- Create: `scripts/docker-up.ps1`

- [ ] **Step 1: Write the script**

Create `scripts/docker-up.ps1`:

```powershell
# Brings up the self-hosted stack (db + migrate + web + mcp-server) with a
# --db local|cloud switch for where Postgres lives.
#
# Usage:
#   .\scripts\docker-up.ps1 [--db local|cloud] [extra docker compose flags]
#
# Examples:
#   .\scripts\docker-up.ps1 --db local --build --force-recreate --remove-orphans
#   .\scripts\docker-up.ps1 --db cloud --build
#   .\scripts\docker-up.ps1 --build                # no --db: same as --db local
#
#   --db local (default) -> starts the bundled `db` container, waits for it to
#                            become healthy, runs `migrate`, then starts
#                            web + mcp-server. DIRECT_URL is set equal to
#                            DATABASE_URL (no pooler locally).
#   --db cloud            -> requires DATABASE_URL (Supabase pooled connection)
#                            and SUPABASE_DB_URL (Supabase direct connection)
#                            already set in .env. Never starts the local `db`
#                            container. DIRECT_URL is set to SUPABASE_DB_URL.
#                            Runs `migrate` against Supabase, then starts
#                            web + mcp-server with --no-deps.
#
# Any flag other than --db is passed straight through to `docker compose up`.

$dbChoice = "local"
$passthrough = @()
for ($i = 0; $i -lt $args.Count; $i++) {
    $a = $args[$i]
    if ($a -eq "--db") { $dbChoice = $args[$i + 1]; $i++ }
    elseif ($a -like "--db=*") { $dbChoice = $a.Split("=", 2)[1] }
    else { $passthrough += $a }
}

if ($dbChoice -ne "local" -and $dbChoice -ne "cloud") {
    Write-Error "Unknown --db value '$dbChoice'. Use 'local' or 'cloud'."
    exit 1
}

# ---- Load .env into the current session (without overriding already-set vars)
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.*)\s*$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                Set-Item -Path "Env:$key" -Value $val
            }
        }
    }
}

$devFiles = @("-f", "docker-compose.yml", "-f", "docker-compose.dev.yml")

function Wait-DbHealthy {
    Write-Host "Waiting for the database to become healthy..."
    for ($n = 1; $n -le 30; $n++) {
        $status = docker compose @devFiles ps db --format json | ConvertFrom-Json
        if ($status -and $status.Health -eq "healthy") {
            Write-Host "Database is healthy."
            return
        }
        Start-Sleep -Seconds 2
    }
    Write-Error "Database did not become healthy in time."
    exit 1
}

if ($dbChoice -eq "local") {
    Write-Host "DB_PROVIDER = postgres (--db local)"
    $env:DIRECT_URL = $env:DATABASE_URL

    docker compose @devFiles up -d db
    Wait-DbHealthy
    docker compose @devFiles run --rm migrate
    docker compose @devFiles up --build -d @passthrough web mcp-server
}
else {
    Write-Host "DB_PROVIDER = supabase (--db cloud)"
    if (-not $env:DATABASE_URL) {
        Write-Error "--db cloud requires DATABASE_URL (Supabase pooled connection) set in .env."
        exit 1
    }
    if (-not $env:SUPABASE_DB_URL) {
        Write-Error "--db cloud requires SUPABASE_DB_URL (Supabase direct connection) set in .env."
        exit 1
    }
    $env:DIRECT_URL = $env:SUPABASE_DB_URL

    docker compose @devFiles run --rm migrate
    docker compose @devFiles up --build -d --no-deps @passthrough web mcp-server
}

Write-Host "Portal:  http://localhost:3000"
Write-Host "MCP:     http://localhost:3001/mcp"
```

- [ ] **Step 2: Syntax-check it**

Run: `powershell -NoProfile -Command "$errors = $null; [void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw scripts/docker-up.ps1), [ref]$errors); if ($errors.Count -gt 0) { $errors } else { 'ok' }"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add scripts/docker-up.ps1
git commit -m "feat: add docker-up.ps1 with --db local|cloud"
```

---

## Task 3: `scripts/docker-up.sh`

**Files:**
- Create: `scripts/docker-up.sh`

- [ ] **Step 1: Write the script**

Create `scripts/docker-up.sh`:

```bash
#!/usr/bin/env bash
# Brings up the self-hosted stack (db + migrate + web + mcp-server) with a
# --db local|cloud switch for where Postgres lives. Bash port of
# docker-up.ps1 - keep the two in sync.
#
# Usage:
#   ./scripts/docker-up.sh [--db local|cloud] [extra docker compose flags]
#
# Examples:
#   ./scripts/docker-up.sh --db local --build --force-recreate --remove-orphans
#   ./scripts/docker-up.sh --db cloud --build
#   ./scripts/docker-up.sh --build                # no --db: same as --db local
#
#   --db local (default) -> starts the bundled `db` container, waits for it to
#                            become healthy, runs `migrate`, then starts
#                            web + mcp-server. DIRECT_URL is set equal to
#                            DATABASE_URL (no pooler locally).
#   --db cloud            -> requires DATABASE_URL (Supabase pooled connection)
#                            and SUPABASE_DB_URL (Supabase direct connection)
#                            already set in .env. Never starts the local `db`
#                            container. DIRECT_URL is set to SUPABASE_DB_URL.
#                            Runs `migrate` against Supabase, then starts
#                            web + mcp-server with --no-deps.
#
# Any flag other than --db is passed straight through to `docker compose up`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    echo "ERROR: neither 'docker compose' nor 'docker-compose' is available." >&2
    exit 1
fi

dbChoice="local"
passthrough=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)   dbChoice="${2:-}"; shift 2 ;;
        --db=*) dbChoice="${1#--db=}"; shift ;;
        *)      passthrough+=("$1"); shift ;;
    esac
done

if [[ "$dbChoice" != "local" && "$dbChoice" != "cloud" ]]; then
    echo "ERROR: Unknown --db value '$dbChoice'. Use 'local' or 'cloud'." >&2
    exit 1
fi

envFile="$REPO_ROOT/.env"
if [[ -f "$envFile" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]] || continue
        key="${BASH_REMATCH[1]}"
        val="${BASH_REMATCH[2]}"
        key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
        val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
        if [[ -z "${!key:-}" ]]; then
            export "$key=$val"
        fi
    done < "$envFile"
fi

DEV_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)

wait_db_healthy() {
    echo "Waiting for the database to become healthy..."
    for _ in $(seq 1 30); do
        status="$("${COMPOSE[@]}" "${DEV_FILES[@]}" ps db --format json | node -e '
let d = "";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try { console.log(JSON.parse(d).Health || ""); } catch { console.log(""); }
});
')"
        if [[ "$status" == "healthy" ]]; then
            echo "Database is healthy."
            return 0
        fi
        sleep 2
    done
    echo "ERROR: Database did not become healthy in time." >&2
    exit 1
}

if [[ "$dbChoice" == "local" ]]; then
    echo "DB_PROVIDER = postgres (--db local)"
    export DIRECT_URL="${DATABASE_URL:-}"

    "${COMPOSE[@]}" "${DEV_FILES[@]}" up -d db
    wait_db_healthy
    "${COMPOSE[@]}" "${DEV_FILES[@]}" run --rm migrate
    "${COMPOSE[@]}" "${DEV_FILES[@]}" up --build -d "${passthrough[@]}" web mcp-server
else
    echo "DB_PROVIDER = supabase (--db cloud)"
    if [[ -z "${DATABASE_URL:-}" ]]; then
        echo "ERROR: --db cloud requires DATABASE_URL (Supabase pooled connection) set in .env." >&2
        exit 1
    fi
    if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
        echo "ERROR: --db cloud requires SUPABASE_DB_URL (Supabase direct connection) set in .env." >&2
        exit 1
    fi
    export DIRECT_URL="$SUPABASE_DB_URL"

    "${COMPOSE[@]}" "${DEV_FILES[@]}" run --rm migrate
    "${COMPOSE[@]}" "${DEV_FILES[@]}" up --build -d --no-deps "${passthrough[@]}" web mcp-server
fi

echo "Portal:  http://localhost:3000"
echo "MCP:     http://localhost:3001/mcp"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/docker-up.sh`

- [ ] **Step 3: Lint it with the repo's shell linter**

Run: `scripts/lint-shell.sh scripts/docker-up.sh`
Expected: no ShellCheck warnings/errors, exits 0. Fix any it reports (common ones here: unquoted expansions, unused variables) before moving on.

- [ ] **Step 4: Commit**

```bash
git add scripts/docker-up.sh
git commit -m "feat: add docker-up.sh with --db local|cloud"
```

---

## Task 4: `scripts/gcp-deploy.py` — config resolution (tested)

Split the script into pure, testable config-resolution logic and an imperative `main()` that shells out. This task covers the pure part with real tests; Task 5 adds the deployment steps around it.

**Files:**
- Create: `scripts/gcp-deploy.py`
- Create: `scripts/test_gcp_deploy.py`

- [ ] **Step 1: Write the failing tests**

Create `scripts/test_gcp_deploy.py`:

```python
import unittest

from gcp_deploy import GcpConfig, load_config


class LoadConfigTests(unittest.TestCase):
    def test_reads_all_keys_from_env(self):
        env = {
            "GCP_PROJECT_ID": "my-project",
            "GCP_REGION": "us-east1",
            "GCP_ARTIFACT_REPO": "my-repo",
            "GCP_WEB_SERVICE_NAME": "my-web",
            "GCP_MCP_SERVICE_NAME": "my-mcp",
        }
        config = load_config(env)
        self.assertEqual(
            config,
            GcpConfig(
                project_id="my-project",
                region="us-east1",
                artifact_repo="my-repo",
                web_service_name="my-web",
                mcp_service_name="my-mcp",
            ),
        )

    def test_applies_defaults_when_optional_keys_missing(self):
        config = load_config({"GCP_PROJECT_ID": "my-project"})
        self.assertEqual(config.region, "us-central1")
        self.assertEqual(config.artifact_repo, "gcr.io")
        self.assertEqual(config.web_service_name, "governed-superpowers-web")
        self.assertEqual(config.mcp_service_name, "governed-superpowers-mcp")

    def test_raises_when_project_id_missing(self):
        with self.assertRaises(SystemExit):
            load_config({})

    def test_image_path_uses_artifact_repo_and_project(self):
        config = load_config({"GCP_PROJECT_ID": "my-project", "GCP_ARTIFACT_REPO": "gcr.io"})
        self.assertEqual(config.image_path("governed-superpowers-web"), "gcr.io/my-project/governed-superpowers-web")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd scripts && python -m unittest test_gcp_deploy -v`
Expected: `ModuleNotFoundError: No module named 'gcp_deploy'` (the module doesn't exist yet).

- [ ] **Step 3: Write `scripts/gcp-deploy.py` with the config layer**

Create `scripts/gcp-deploy.py`:

```python
#!/usr/bin/env python3
"""
Deploy the governed-superpowers self-hosted stack (web + mcp-server) to
Google Cloud Run.

Usage:
    python scripts/gcp-deploy.py

Config comes from .env (repo root) plus real environment variables (which take
precedence - useful in CI). Required:

    GCP_PROJECT_ID

Optional, with defaults:

    GCP_REGION            default: us-central1
    GCP_ARTIFACT_REPO      default: gcr.io
    GCP_WEB_SERVICE_NAME   default: governed-superpowers-web
    GCP_MCP_SERVICE_NAME   default: governed-superpowers-mcp

If SUPABASE_DB_URL is set, pending Prisma migrations are applied against it
before deploying.

Requirements: gcloud CLI, Docker.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_ENV_KEYS = ["GCP_PROJECT_ID"]
DEFAULTS = {
    "GCP_REGION": "us-central1",
    "GCP_ARTIFACT_REPO": "gcr.io",
    "GCP_WEB_SERVICE_NAME": "governed-superpowers-web",
    "GCP_MCP_SERVICE_NAME": "governed-superpowers-mcp",
}

# SMTP_* and MAIL_FROM/APP_URL are forwarded to the `web` Cloud Run service
# from .env, mirroring the env list docker-compose.yml already gives it.
WEB_ENV_PASSTHROUGH_KEYS = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_SECURE",
    "MAIL_FROM",
]


@dataclass(frozen=True)
class GcpConfig:
    project_id: str
    region: str
    artifact_repo: str
    web_service_name: str
    mcp_service_name: str

    def image_path(self, service_name: str) -> str:
        return f"{self.artifact_repo}/{self.project_id}/{service_name}"


def read_dotenv(path: Path) -> dict[str, str]:
    """Parse a .env file into a dict. Missing file returns {}."""
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def load_config(env: dict[str, str]) -> GcpConfig:
    """Resolve GcpConfig from a merged env dict (real env vars should already
    take precedence over .env values by the time this is called - see
    resolve_env()). Exits with an error message if GCP_PROJECT_ID is missing.
    """
    missing = [key for key in REQUIRED_ENV_KEYS if not env.get(key)]
    if missing:
        sys.exit(f"ERROR: missing required config: {', '.join(missing)} (set in .env or the environment)")

    def get(key: str) -> str:
        return env.get(key) or DEFAULTS[key]

    return GcpConfig(
        project_id=env["GCP_PROJECT_ID"],
        region=get("GCP_REGION"),
        artifact_repo=get("GCP_ARTIFACT_REPO"),
        web_service_name=get("GCP_WEB_SERVICE_NAME"),
        mcp_service_name=get("GCP_MCP_SERVICE_NAME"),
    )


def resolve_env() -> dict[str, str]:
    """.env values, overridden by real environment variables (CI override)."""
    env = read_dotenv(REPO_ROOT / ".env")
    for key, value in os.environ.items():
        if value:
            env[key] = value
    return env


if __name__ == "__main__":
    # Deployment steps land in Task 5 - this file is import-safe (no
    # side effects at import time) so scripts/test_gcp_deploy.py can import
    # GcpConfig/load_config without shelling out to gcloud/docker.
    pass
```

- [ ] **Step 4: Run the tests again to verify they pass**

Run: `cd scripts && python -m unittest test_gcp_deploy -v`
Expected: 4 tests, all `ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/gcp-deploy.py scripts/test_gcp_deploy.py
git commit -m "feat: add gcp-deploy.py config resolution with tests"
```

---

## Task 5: `scripts/gcp-deploy.py` — deployment steps

**Files:**
- Modify: `scripts/gcp-deploy.py`

- [ ] **Step 1: Add the command-running helpers and deployment steps**

Replace the `if __name__ == "__main__":` block at the end of `scripts/gcp-deploy.py` with:

```python
def run(command: list[str], **kwargs) -> None:
    print(f"\n>>> {' '.join(command)}\n")
    result = subprocess.run(command, **kwargs)
    if result.returncode != 0:
        sys.exit(f"ERROR: command failed ({result.returncode}): {' '.join(command)}")


def run_capture(command: list[str]) -> str:
    print(f"\n>>> {' '.join(command)}\n")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"ERROR: command failed ({result.returncode}): {' '.join(command)}\n{result.stderr}")
    return result.stdout.strip()


def ensure_artifact_registry(config: GcpConfig) -> None:
    print("\nEnsuring Artifact Registry repository exists...\n")
    subprocess.run(
        [
            "gcloud", "artifacts", "repositories", "create", config.artifact_repo,
            "--repository-format=docker",
            f"--location={config.region}",
            "--description=governed-superpowers deploy",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )  # non-fatal if it already exists - the next steps fail loudly if the repo is actually unusable


def apply_supabase_migrations(env: dict[str, str]) -> None:
    supabase_db_url = env.get("SUPABASE_DB_URL")
    if not supabase_db_url:
        print("SUPABASE_DB_URL not set - skipping cloud migration step.")
        return
    print("\nApplying Prisma migrations against Supabase...\n")
    migrate_env = dict(os.environ)
    migrate_env["DATABASE_URL"] = supabase_db_url
    migrate_env["DIRECT_URL"] = supabase_db_url
    run(["npx", "prisma", "migrate", "deploy"], cwd=str(REPO_ROOT / "web"), env=migrate_env)


def build_and_push(image: str, dockerfile: str, context: str, target: str | None = None) -> None:
    print(f"\nBuilding {image}...\n")
    command = ["docker", "build", "-f", dockerfile, "-t", image]
    if target:
        command += ["--target", target]
    command += [context]
    run(command)
    run(["docker", "push", image])


def deploy_mcp_server(config: GcpConfig, env: dict[str, str], database_url: str) -> str:
    image = config.image_path(config.mcp_service_name)
    build_and_push(image, dockerfile="mcp-server/Dockerfile", context=str(REPO_ROOT))

    print(f"\nDeploying {config.mcp_service_name} to Cloud Run...\n")
    run(
        [
            "gcloud", "run", "deploy", config.mcp_service_name,
            "--image", image,
            "--platform", "managed",
            "--region", config.region,
            "--port", "3000",
            "--set-env-vars", f"DATABASE_URL={database_url},PORT=3000",
            "--allow-unauthenticated",
        ]
    )
    return run_capture(
        [
            "gcloud", "run", "services", "describe", config.mcp_service_name,
            "--platform", "managed", "--region", config.region,
            "--format", "value(status.url)",
        ]
    )


def deploy_web(config: GcpConfig, env: dict[str, str], database_url: str) -> str:
    image = config.image_path(config.web_service_name)
    build_and_push(image, dockerfile="web/Dockerfile", context=str(REPO_ROOT / "web"), target="runtime")

    env_pairs = [f"DATABASE_URL={database_url}", "PORT=3000"]
    for key in WEB_ENV_PASSTHROUGH_KEYS:
        if env.get(key):
            env_pairs.append(f"{key}={env[key]}")
    app_url = env.get("APP_URL")
    if app_url:
        env_pairs.append(f"APP_URL={app_url}")

    print(f"\nDeploying {config.web_service_name} to Cloud Run...\n")
    run(
        [
            "gcloud", "run", "deploy", config.web_service_name,
            "--image", image,
            "--platform", "managed",
            "--region", config.region,
            "--port", "3000",
            "--set-env-vars", ",".join(env_pairs),
            "--allow-unauthenticated",
        ]
    )

    service_url = run_capture(
        [
            "gcloud", "run", "services", "describe", config.web_service_name,
            "--platform", "managed", "--region", config.region,
            "--format", "value(status.url)",
        ]
    )

    if not app_url:
        print(f"\nAPP_URL not set in .env - updating {config.web_service_name} with its Cloud Run URL ({service_url})...\n")
        run(
            [
                "gcloud", "run", "services", "update", config.web_service_name,
                "--region", config.region,
                "--update-env-vars", f"APP_URL={service_url}",
            ]
        )
        return service_url
    return app_url


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.parse_args()

    env = resolve_env()
    config = load_config(env)

    database_url = env.get("DATABASE_URL")
    if not database_url:
        sys.exit("ERROR: DATABASE_URL must be set in .env (Supabase pooled connection, or your own managed Postgres).")

    print(f"Project:  {config.project_id}")
    print(f"Region:   {config.region}")

    if not os.environ.get("CI"):
        run(["gcloud", "auth", "login"])
    run(["gcloud", "config", "set", "project", config.project_id])
    ensure_artifact_registry(config)
    run(["gcloud", "auth", "configure-docker", "--quiet"])

    apply_supabase_migrations(env)

    mcp_url = deploy_mcp_server(config, env, database_url)
    web_url = deploy_web(config, env, database_url)

    print("\n================================================")
    print(" Deployment complete")
    print("================================================\n")
    print(f"Portal:  {web_url}")
    print(f"MCP:     {mcp_url}/mcp")
    print("\nNext: open the portal URL, sign up, confirm your email, mint a token on the")
    print("Tokens page, then:")
    print(f'  claude mcp add --transport http governed-superpowers {mcp_url}/mcp \\')
    print('    --header "Authorization: Bearer <your token>"')


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Re-run the config tests to confirm they still pass**

Run: `cd scripts && python -m unittest test_gcp_deploy -v`
Expected: 4 tests, all `ok` (the new code is all under `main()`/deploy helpers, untouched by these tests).

- [ ] **Step 3: Byte-compile check the whole file**

Run: `python -m py_compile scripts/gcp-deploy.py`
Expected: no output, exit code 0.

- [ ] **Step 4: Smoke-test argument parsing without touching GCP**

Run: `python scripts/gcp-deploy.py --help`
Expected: prints the usage/docstring and exits 0, without calling `gcloud`.

- [ ] **Step 5: Commit**

```bash
git add scripts/gcp-deploy.py
git commit -m "feat: add gcp-deploy.py Cloud Run deployment steps"
```

---

## Task 6: Documentation

**Files:**
- Modify: `README.md` (the "Self-hosting" section, around the existing "Run it locally" / "Deploy it" subsections)
- Modify: `mcp-server/README.md` (the "Docker Compose deployment" section)

- [ ] **Step 1: Document `docker-up` scripts in the root README**

In `README.md`, immediately after the existing "Deploy it" code block (the one with `docker compose up -d db` / `run --rm migrate` / `up -d --build`), add:

```markdown
Or use the wrapper script, which also supports a Supabase-hosted Postgres
instead of the bundled `db` container:

\`\`\`bash
scripts/docker-up.sh --db local --build    # bundled Postgres (default)
scripts/docker-up.sh --db cloud --build    # Supabase - requires DATABASE_URL
                                            # and SUPABASE_DB_URL in .env
\`\`\`

(`scripts/docker-up.ps1` on Windows, same flags.) Extra flags
(`--force-recreate`, `--remove-orphans`, ...) pass straight through to
`docker compose up`.

### Deploy to Google Cloud Run

\`\`\`bash
python scripts/gcp-deploy.py
\`\`\`

Builds and deploys `web` and `mcp-server` as two independent Cloud Run
services (each gets its own URL - there's no single-domain path routing on
Cloud Run the way Caddy does it locally). Requires `GCP_PROJECT_ID` and
`DATABASE_URL` in `.env`; see the comment block at the top of
`scripts/gcp-deploy.py` for every config key it reads.
```

- [ ] **Step 2: Cross-link from `mcp-server/README.md`**

In `mcp-server/README.md`, in the "Docker Compose deployment" section, immediately before the `### Deploying to a fresh Ubuntu host` heading, add:

```markdown
### Deploying to Google Cloud Run

See [`scripts/gcp-deploy.py`](../scripts/gcp-deploy.py) and the "Deploy to
Google Cloud Run" section of the [root README](../README.md#self-hosting-account-portal--mcp-server) -
it deploys `web` and `mcp-server` as two independent Cloud Run services
rather than reproducing Caddy's single-domain path routing.
```

- [ ] **Step 3: Commit**

```bash
git add README.md mcp-server/README.md
git commit -m "docs: document docker-up.{ps1,sh} and gcp-deploy.py"
```

---

## Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run every test suite touched by this plan**

```bash
cd web && npx prisma validate && cd ..
cd scripts && python -m unittest test_gcp_deploy -v && cd ..
scripts/lint-shell.sh scripts/docker-up.sh
powershell -NoProfile -Command "$errors = $null; [void][System.Management.Automation.PSParser]::Tokenize((Get-Content -Raw scripts/docker-up.ps1), [ref]$errors); if ($errors.Count -gt 0) { $errors } else { 'ok' }"
python -m py_compile scripts/gcp-deploy.py
```

Expected: every command exits 0 with no errors reported.

- [ ] **Step 2: Local end-to-end smoke test (requires Docker)**

```bash
cp .env.example .env
# fill in POSTGRES_PASSWORD, DATABASE_URL, SMTP_* with real values
scripts/docker-up.sh --db local --build
curl -sS http://localhost:3001/healthz
```

Expected: `curl` returns HTTP 200. Sign up at `http://localhost:3000`, confirm via the emailed link (real SMTP required - no dev mail sink), mint a token, and verify `curl -H "Authorization: Bearer <token>" http://localhost:3001/mcp` doesn't 401.

This step needs a real Docker environment and SMTP credentials, so it can't run unattended in this plan — do it manually before considering the branch done.
