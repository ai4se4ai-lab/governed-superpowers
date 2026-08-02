# Brings up the self-hosted stack (db + migrate + web + mcp-server) with a
# --db local|cloud switch for where Postgres lives.
#
# Usage:
#   .\scripts\docker-up.ps1 [--db local|cloud] [--edge] [extra docker compose flags]
#
# Examples:
#   .\scripts\docker-up.ps1 --db local --build --force-recreate --remove-orphans
#   .\scripts\docker-up.ps1 --db cloud --build
#   .\scripts\docker-up.ps1 --build                # no --db: same as --db local
#   .\scripts\docker-up.ps1 --edge --build          # also start the caddy edge
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
#
# Migrations are always applied from a freshly built migrator image, so
# upgrading an existing deployment picks up new migrations (e.g. the
# collaboration-graph tables) without any extra step.

$dbChoice = "local"
$edge = $false
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
    elseif ($a -eq "--edge") { $edge = $true }
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

if ($edge) {
    if (-not $env:APP_DOMAIN) {
        Write-Error "--edge requires APP_DOMAIN set in .env - see .env.example."
        exit 1
    }
    $composeFiles = @("-f", "docker-compose.yml")
    $edgeServices = @("web", "mcp-server", "caddy")
}
else {
    $composeFiles = @("-f", "docker-compose.yml", "-f", "docker-compose.dev.yml")
    $edgeServices = @("web", "mcp-server")
}

# docker compose failures are not terminating errors in PowerShell, so every
# step has to be checked explicitly. Without this a failed migration would let
# the script carry on and start the app against a database missing its tables.
function Invoke-Step {
    param([string]$What, [scriptblock]$Step)
    & $Step
    if ($LASTEXITCODE -ne 0) {
        Write-Error "$What failed (exit $LASTEXITCODE). Stack not started."
        exit 1
    }
}

function Wait-DbHealthy {
    Write-Host "Waiting for the database to become healthy..."
    for ($n = 1; $n -le 30; $n++) {
        $status = docker compose @composeFiles ps db --format json | ConvertFrom-Json
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

    Invoke-Step "Starting the database" { docker compose @composeFiles up -d db }
    Wait-DbHealthy
    # --build is load-bearing on an upgrade: `run` reuses an existing image, so
    # without it a stack that was deployed before a migration was added keeps
    # running the OLD migrator image and silently skips the new migration.
    Invoke-Step "Applying migrations" { docker compose @composeFiles run --build --rm migrate }
    Invoke-Step "Starting the stack" { docker compose @composeFiles up --build -d @passthrough @edgeServices }
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

    # --no-deps: migrate declares depends_on: db, and without this `run` would
    # start the bundled Postgres container that cloud mode exists to avoid.
    # --build for the same upgrade reason as the local branch above.
    Invoke-Step "Applying migrations" { docker compose @composeFiles run --build --rm --no-deps migrate }
    Invoke-Step "Starting the stack" { docker compose @composeFiles up --build -d --no-deps @passthrough @edgeServices }
}

if ($edge) {
    $base = "https://$($env:APP_DOMAIN)"
    Write-Host "Portal:  $base"
    Write-Host "Graphs:  $base/graphs"
    Write-Host "MCP:     $base/mcp"
}
else {
    Write-Host "Portal:  http://localhost:3000"
    Write-Host "Graphs:  http://localhost:3000/graphs"
    Write-Host "MCP:     http://localhost:3001/mcp"
}
