#!/usr/bin/env bash
# Brings up the self-hosted stack (db + migrate + web + mcp-server) with a
# --db local|cloud switch for where Postgres lives. Bash port of
# docker-up.ps1 - keep the two in sync.
#
# Usage:
#   ./scripts/docker-up.sh [--db local|cloud] [--edge] [extra docker compose flags]
#
# Examples:
#   ./scripts/docker-up.sh --db local --build --force-recreate --remove-orphans
#   ./scripts/docker-up.sh --db cloud --build
#   ./scripts/docker-up.sh --build                # no --db: same as --db local
#   ./scripts/docker-up.sh --edge --build          # also start the caddy edge
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
#   --edge                -> without this flag, web/mcp-server publish ports
#                            directly (docker-compose.dev.yml) and no edge
#                            proxy runs - fine for local use, but nothing
#                            outside this host can reach it. With --edge, the
#                            dev overlay is skipped, `caddy` is started too,
#                            and web/mcp-server go back to internal-only
#                            (matching production docker-compose.yml). Needs
#                            APP_DOMAIN set in .env; on hosts behind a proxy
#                            you don't control, also set CADDYFILE_PATH and
#                            CADDY_HTTP_PORT - see .env.example.
#
# Any flag other than --db/--edge is passed straight through to `docker
# compose up`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: 'docker compose' (v2, the Compose plugin) is required and was not found." >&2
    exit 1
fi
COMPOSE=(docker compose)

dbChoice="local"
edge=false
passthrough=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            if [[ $# -lt 2 ]]; then
                echo "ERROR: --db requires a value ('local' or 'cloud')." >&2
                exit 1
            fi
            dbChoice="$2"; shift 2 ;;
        --db=*) dbChoice="${1#--db=}"; shift ;;
        --edge) edge=true; shift ;;
        *)      passthrough+=("$1"); shift ;;
    esac
done

if [[ "$dbChoice" != "local" && "$dbChoice" != "cloud" ]]; then
    echo "ERROR: Unknown --db value '$dbChoice'. Use 'local' or 'cloud'." >&2
    exit 1
fi

# Always reflects the file on disk, so edits take effect even when rerun in
# a shell where a previous invocation already exported these variables.
envFile="$REPO_ROOT/.env"
if [[ -f "$envFile" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^[[:space:]]*([^=]+)=(.*)$ ]] || continue
        key="${BASH_REMATCH[1]}"
        val="${BASH_REMATCH[2]}"
        key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
        val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
        export "$key=$val"
    done < "$envFile"
fi

if [[ "$edge" == true ]]; then
    if [[ -z "${APP_DOMAIN:-}" ]]; then
        echo "ERROR: --edge requires APP_DOMAIN set in .env - see .env.example." >&2
        exit 1
    fi
    COMPOSE_FILES=(-f docker-compose.yml)
    edgeServices=(web mcp-server caddy)
else
    COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)
    edgeServices=(web mcp-server)
fi

wait_db_healthy() {
    echo "Waiting for the database to become healthy..."
    for _ in $(seq 1 30); do
        status="$("${COMPOSE[@]}" "${COMPOSE_FILES[@]}" ps db --format json | node -e '
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

    "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up -d db
    wait_db_healthy
    "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" run --rm migrate
    "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up --build -d "${passthrough[@]}" "${edgeServices[@]}"
else
    echo "DB_PROVIDER = supabase (--db cloud)"
    # db is never started in this mode, but the compose file still hard-requires
    # POSTGRES_PASSWORD via ${POSTGRES_PASSWORD:?...} on the db service - set a
    # throwaway value so interpolation doesn't fail for cloud-only users who
    # reasonably left it blank in .env.
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-unused-in-cloud-mode}"

    if [[ -z "${DATABASE_URL:-}" ]]; then
        echo "ERROR: --db cloud requires DATABASE_URL (Supabase pooled connection) set in .env." >&2
        exit 1
    fi
    if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
        echo "ERROR: --db cloud requires SUPABASE_DB_URL (Supabase direct connection) set in .env." >&2
        exit 1
    fi
    export DIRECT_URL="$SUPABASE_DB_URL"

    "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" run --rm migrate
    "${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up --build -d --no-deps "${passthrough[@]}" "${edgeServices[@]}"
fi

if [[ "$edge" == true ]]; then
    echo "Portal:  https://$APP_DOMAIN"
    echo "MCP:     https://$APP_DOMAIN/mcp"
else
    echo "Portal:  http://localhost:3000"
    echo "MCP:     http://localhost:3001/mcp"
fi
