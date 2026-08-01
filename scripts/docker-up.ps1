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
    if ($a -eq "--db") {
        if ($i + 1 -ge $args.Count) {
            Write-Error "--db requires a value ('local' or 'cloud')."
            exit 1
        }
        $dbChoice = $args[$i + 1]; $i++
    }
    elseif ($a -like "--db=*") { $dbChoice = $a.Split("=", 2)[1] }
    else { $passthrough += $a }
}

if ($dbChoice -ne "local" -and $dbChoice -ne "cloud") {
    Write-Error "Unknown --db value '$dbChoice'. Use 'local' or 'cloud'."
    exit 1
}

# ---- Load .env into the current session (always reflects the file on disk,
# so edits take effect even when rerun in a PowerShell window where a
# previous invocation already set these variables).
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.*)\s*$') {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            Set-Item -Path "Env:$key" -Value $val
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
    if (-not $env:POSTGRES_PASSWORD) {
        # Never used by any service compose starts in cloud mode (`db` is never
        # started), but the compose file's `db` service still hard-requires it
        # via ${POSTGRES_PASSWORD:?...}, so set a throwaway placeholder.
        $env:POSTGRES_PASSWORD = "unused-in-cloud-mode"
    }
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
