# GCP + Supabase deploy tooling — design

## Problem

The self-hosted stack (`web/` account portal + `mcp-server/`, behind Caddy, on a
single bundled Postgres) only has manual `docker compose` commands documented
in the README. There's no scripted path to:

- run against a managed/hosted Postgres (Supabase) instead of the bundled
  container, for either local dev or production, and
- deploy the two services to Google Cloud Run.

The user runs a sibling project (MindPortalix) with `scripts/docker-up.ps1
--db local|cloud` and `scripts/gcp-deploy.py`, and wants equivalent ergonomics
here — but adapted to this repo's actual architecture, not copied verbatim.

## Non-goals

- **No Supabase Auth integration.** This app already has its own working auth
  (Prisma + bcrypt + SMTP email confirmation in `web/src`). "Supabase support"
  here means *Supabase as a hosted Postgres provider only* — same schema, same
  auth code, just a different `DATABASE_URL`. A dual auth-provider system
  (like MindPortalix's `AUTH_PROVIDER=local|supabase`) is out of scope.
- **No `--auth` or `--llm` flags** in the docker-up scripts — neither concept
  (auth-provider switch, local Ollama LLM) exists in this project.
- **No single-domain path routing on Cloud Run.** The Docker+Caddy deployment
  keeps its existing single-domain `/mcp` path routing. The Cloud Run
  deployment is a separate, simpler topology: two independent services, each
  with its own URL (no load balancer / URL map / Serverless NEGs).

## Component 1 — Supabase-as-hosted-Postgres

Supabase's pooled connection (port 6543, pgbouncer transaction mode) does not
support Prisma's migration engine (Prisma's documented requirement: migrations
need a direct, non-pooled connection). So two connection strings are needed
when `DB_PROVIDER=supabase`:

- `DATABASE_URL` — runtime connection. Local: the bundled `db` container's
  connection string (unchanged). Cloud: Supabase's **pooled** connection
  string (port 6543).
- `SUPABASE_DB_URL` — new. Supabase's **direct** connection string (port
  5432), used only for running migrations. Named to match the equivalent
  variable in MindPortalix.

Changes:

- `web/prisma/schema.prisma`: add `directUrl = env("DIRECT_URL")` to the
  `datasource db` block.
- `docker-compose.yml`: the `migrate` service gains a required `DIRECT_URL`
  environment entry, same `:?` required-var style as `DATABASE_URL`.
- `.env.example`: add `DB_PROVIDER=postgres` (`postgres`|`supabase`,
  documentation only — nothing branches on it in code) and a commented-out
  `# SUPABASE_DB_URL=` for the cloud/direct connection.

`mcp-server/src/db.ts` needs no changes: it issues plain parameterized
queries via `pg.Pool`, which work against Supabase's pooled connection without
modification.

## Component 2 — `scripts/docker-up.ps1` + `scripts/docker-up.sh`

```
scripts/docker-up.ps1 [--db local|cloud] [extra docker compose flags]
scripts/docker-up.sh  [--db local|cloud] [extra docker compose flags]
```

Both scripts, in lockstep (mirroring the existing `bump-version.sh` /
PowerShell-equivalent pattern in this repo where applicable):

1. Load `.env` into the shell environment, without overriding vars already
   set (same rule as the MindPortalix reference).
2. Resolve `--db`:
   - **`local`** (default): `DIRECT_URL` is set equal to `DATABASE_URL` (no
     pooler locally, so they're the same connection). Runs, in order:
     `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db`
     → wait for the `db` healthcheck → `run --rm migrate` →
     `up --build -d web mcp-server` (dev overlay, so ports publish to the
     host without needing `APP_DOMAIN`/TLS).
   - **`cloud`**: requires `DATABASE_URL` and `SUPABASE_DB_URL` already set in
     `.env` (error out with a clear message if either is missing).
     `DIRECT_URL` is set equal to `SUPABASE_DB_URL`. The `db` service is never
     started. Runs `run --rm migrate` against the cloud DB, then
     `up --build -d --no-deps web mcp-server` (dev overlay still applied, so
     local ports still publish for testing against the cloud DB).
3. Any additional CLI arguments (`--build`, `--force-recreate`,
   `--remove-orphans`, ...) pass straight through to the final
   `docker compose up` invocation, so existing muscle memory
   (`docker-up.ps1 --db local --build --force-recreate --remove-orphans`)
   keeps working.

## Component 3 — `scripts/gcp-deploy.py`

Config is read from `.env` (with CI environment variables taking precedence,
same override rule as the reference) and/or CLI flags — **no hardcoded
project ID, email, or service names**, since this is a public repo other
people self-host. New `.env` keys, all with sensible defaults except the
project ID:

- `GCP_PROJECT_ID` (required, no default)
- `GCP_REGION` (default `us-central1`)
- `GCP_ARTIFACT_REPO` (default `gcr.io`)
- `GCP_WEB_SERVICE_NAME` (default `governed-superpowers-web`)
- `GCP_MCP_SERVICE_NAME` (default `governed-superpowers-mcp`)

Steps:

1. `gcloud auth login` (skipped when `CI` env var is set), `gcloud config set
   project`, ensure the Artifact Registry repo exists (idempotent — tolerate
   "already exists"), `gcloud auth configure-docker`.
2. If `SUPABASE_DB_URL` is set: apply pending Prisma migrations against the
   cloud DB *before* deploying, by running `npx prisma migrate deploy` inside
   `web/` with `DATABASE_URL`/`DIRECT_URL` pointed at Supabase. (This project
   uses Prisma migrations, not `supabase db push` — that reference-script step
   doesn't apply here as-is.)
3. Build and push both images with **plain `docker build` + `docker push`**,
   not `gcloud builds submit --tag`. Reason: both Dockerfiles live at
   non-default locations relative to their build contexts —
   `mcp-server/Dockerfile` with context `.`, and `web/Dockerfile --target
   runtime` with context `./web` — and the `--tag` shorthand only looks for a
   root-level `Dockerfile` in the given context. `docker build -f <path> -t
   <image> <context>` handles both without needing a `cloudbuild.yaml`.
4. Deploy `mcp-server` to Cloud Run: env `DATABASE_URL`, `PORT=3000`,
   `--allow-unauthenticated`. Confirmed safe: `mcp-server/src/auth.ts`
   requires a valid per-user bearer token on every request by design — the
   module comment states it's "meant to be reachable from the public
   internet."
5. Deploy `web` to Cloud Run: env `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM` (passed through
   from `.env`, matching the existing `docker-compose.yml` env list for
   `web`), and `APP_URL`. Since the Cloud Run URL isn't known before the
   first deploy, do a two-pass update: deploy once, read back the assigned
   URL via `gcloud run services describe --format value(status.url)`, then
   `gcloud run services update --update-env-vars APP_URL=<url>` — skipped if
   `APP_URL` was already set in `.env` (e.g. a mapped custom domain).
6. Print both service URLs and the next manual step (sign up in the portal,
   confirm email, mint a token, `claude mcp add --transport http ...`
   pointed at the mcp-server's Cloud Run URL).

## Testing

- `docker-up.ps1 --db local` and `docker-up.sh --db local`: full stack comes
  up against the bundled `db` container, migrations apply, portal reachable
  at `localhost:3000`, mcp-server at `localhost:3001/mcp`.
- `docker-up.ps1 --db cloud` / `.sh --db cloud` against a real Supabase
  project: migrations apply via the direct connection, `web`/`mcp-server`
  start without a local `db` container, signup + token flow works against
  Supabase-hosted Postgres.
- `gcp-deploy.py` against a real GCP project: both Cloud Run services deploy,
  are reachable, and env vars (SMTP, `APP_URL`) show up correctly on the
  `web` service via `gcloud run services describe`.
