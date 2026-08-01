# governed-superpowers MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that
serves the governed-superpowers skill library (`../skills/`) over Streamable
HTTP, so any MCP client - VS Code / GitHub Copilot Chat in particular - can
connect to a remotely hosted instance and use every skill without installing
this plugin locally.

It is a read-only content server: it exposes skill text (as MCP prompts,
resources, and a small set of tools) and returns the same bootstrap briefing
Claude Code's `SessionStart` hook injects locally, via the MCP `initialize`
response's `instructions` field. It does not execute code, does not touch
your workspace, and does not run the brainstorming skill's local visual
companion server - see
[`skills/using-superpowers/references/mcp-tools.md`](../skills/using-superpowers/references/mcp-tools.md)
for exactly what this harness can and can't do.

## What it exposes

- **Prompts** - one per skill (14 total). Calling a prompt (e.g.
  `brainstorming`) returns that skill's full `SKILL.md` body, the MCP
  equivalent of Claude Code's `Skill` tool.
- **Resources** - every file under each skill's directory
  (`SKILL.md` + anything in `references/`, `scripts/`, `templates/`, etc.)
  at `skill://<skill-name>/<file>`.
- **Tools** - `list_skills`, `get_skill(name)`, `search_skills(query)`,
  `get_bootstrap` (for clients that don't surface prompts/`instructions`
  well).
- **`instructions`** (returned at `initialize`) - the bootstrap skill body +
  the MCP tool-mapping reference, injected automatically, no per-session
  opt-in required.

## Authentication

Every `/mcp` request must present `Authorization: Bearer <token>`, where the
token was issued to a user by the **account portal** in [`web/`](../web). There
is no shared static token: each token belongs to one account, can carry an
expiry, and can be revoked from the portal — revocation takes effect on the very
next request.

The server validates tokens by querying the portal's Postgres database
directly ([`src/db.ts`](src/db.ts)): a token is `gsp_<prefix>_<secret>`, the
prefix is a uniquely indexed lookup key, and the secret half is compared
against a stored SHA-256 hash in constant time. The plaintext is never stored.

> **Upgrading from a pre-portal deployment?** `MCP_SERVER_TOKEN` no longer
> exists and old tokens stop working. Bring up the stack (which now includes
> Postgres and the portal), sign up, confirm your address, mint a token on the
> Tokens page, and update your clients.

## Local development

```bash
cd mcp-server
npm install
npm run build   # tsc -> dist/
npm test        # node's built-in test runner via tsx
npm run dev     # tsx watch src/index.ts (needs DATABASE_URL set)
```

`npm run dev` / `npm start` need:
- `DATABASE_URL` - required, no default. Points at the portal's Postgres.
  The server refuses to start without it, rather than come up unauthenticated
  on the public internet. Start one with
  `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db`.
- `SKILLS_DIR` - optional, defaults to `../skills` relative to this
  package. Override if you're pointing at a different checkout.
- `PORT` - optional, defaults to `3000`.

`npm test` runs without a database. The integration tests in
`test/db.test.ts` exercise the real SQL and are skipped unless you point them
at one:

```bash
TEST_DATABASE_URL=postgresql://governed:...@localhost:5432/governed npm test
```

Quick manual check once running:

```bash
curl http://localhost:3000/healthz
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
# (paste a token from the portal as the Authorization: Bearer header in the Inspector UI)
```

## Docker Compose deployment

From the **repo root** (the build context needs to see both `mcp-server/`
and the sibling `skills/` directory):

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, DATABASE_URL, APP_DOMAIN, APP_URL and SMTP_*
docker compose up -d db
docker compose run --rm migrate
docker compose up -d --build
```

This starts four long-running services, plus a one-shot migration step you run
explicitly:
- `db` - Postgres 17, storing accounts and tokens on the `pgdata` volume.
- `migrate` - one-shot `prisma migrate deploy`. Not started by `up`; run it
  explicitly (as above) before first start and after any schema change, so
  the app services never start against an unknown schema.
- `web` - the account portal (Next.js), not published to the host directly.
- `mcp-server` - the Node app from `mcp-server/Dockerfile`, not published to
  the host directly.
- `caddy` - reverse proxy that obtains a Let's Encrypt certificate for
  `APP_DOMAIN` automatically. It path-routes: `/mcp*` and `/healthz` go to
  `mcp-server`, everything else to the portal. Requires `APP_DOMAIN` to
  already have an A/AAAA record pointing at this host, and ports 80/443 open.
  Swap it for nginx/Traefik if you'd rather — it just has to reproduce that
  routing.

Keeping `/mcp` on the same domain as the portal is deliberate: clients already
configured with `https://<domain>/mcp` keep working.

There is no bundled dev mail sink - `SMTP_*` must point at a real provider
even for local testing, or the signup -> confirm loop can't deliver its email.

For local testing without a domain or TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d web mcp-server
# portal  http://localhost:3000
# MCP     http://localhost:3001/mcp
```

**Redeploying after a skill edit**: skill content is copied into the image
at build time (`COPY skills /app/skills` in the Dockerfile), so
`docker compose up -d --build` picks up changes; there's no live-reload in
production.

### Deploying to Google Cloud Run

See [`scripts/gcp-deploy.py`](../scripts/gcp-deploy.py) and the "Deploy to
Google Cloud Run" section of the [root README](../README.md#self-hosting-account-portal--mcp-server) -
it deploys `web` and `mcp-server` as two independent Cloud Run services
rather than reproducing Caddy's single-domain path routing.

### Deploying to a fresh Ubuntu host (or any other Docker host - GCP, etc.)

```bash
# on the target host
git clone <this repo>
cd governed-superpowers
cp .env.example .env
# edit .env
docker compose up -d db
docker compose run --rm migrate
docker compose up -d --build
```

Point `APP_DOMAIN`'s DNS record at the host before starting `caddy`, or its
first certificate request will fail (it retries automatically once DNS
resolves).

Then open `https://<your-domain>/`, sign up, confirm your address, and mint
your first token on the Tokens page. Set `SMTP_*` to a real provider first —
there is no dev mail sink, so confirmation mail has nowhere to go otherwise.

## Connecting from VS Code

Add to your MCP config (`mcp.json` - via the Command Palette:
"MCP: Add Server", or edit directly):

```json
{
  "servers": {
    "governed-superpowers": {
      "type": "http",
      "url": "https://<your-domain>/mcp",
      "headers": {
        "Authorization": "Bearer ${input:mcp_token}"
      }
    }
  },
  "inputs": [
    {
      "id": "mcp_token",
      "type": "promptString",
      "description": "governed-superpowers MCP token (from the portal's Tokens page)",
      "password": true
    }
  ]
}
```

VS Code will prompt for the token once and reuse it for the session. Once
connected, the 14 skills appear as prompts/slash commands, and `list_skills`
/ `get_skill` / `search_skills` are available as tools.

## Testing a deployed instance

Once `APP_DOMAIN` has DNS pointed at your host and `docker compose up -d --build`
has run, verify it end-to-end:

**1. Health check (no auth):**

```bash
curl -sS https://<your-domain>/healthz
```

Expect HTTP 200. If this fails, fix DNS/Caddy/the container before testing
MCP itself.

**2. Get a token:**

Open `https://<your-domain>/`, sign up, click the link in the confirmation
email, sign in, and mint a token on the Tokens page. Copy it — the full value
is shown once.

**3. Auth sanity check:**

```bash
# no token -> should 401
curl -sS -o /dev/null -w "%{http_code}\n" https://<your-domain>/mcp

# with token -> should not 401 (400/406 depending on client is fine - it proves auth passed)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <your token>" \
  https://<your-domain>/mcp
```

**4. Real query via MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector https://<your-domain>/mcp
```

Set transport to Streamable HTTP, URL to `https://<your-domain>/mcp`, add
header `Authorization: Bearer <your token>`, and connect. Seeing the 14 skills
listed as prompts and getting a response back from `list_skills` confirms the
server is live and serving content, not just that the port is open.

**5. Confirm revocation works:**

Revoke that token on the Tokens page, then re-run step 3. It should now 401.
The Tokens page also shows a "last used" timestamp from your earlier requests.

## Project layout

```
src/
  index.ts       CLI entrypoint: reads env vars, calls createApp(), listens
  app.ts         Express app: /healthz, bearer auth, session-routed /mcp
  server.ts      buildServer(): one McpServer per session
  bootstrap.ts   builds the `instructions` string
  skills.ts      scans skills/*/SKILL.md, parses frontmatter, indexes files
  resources.ts   registers skill://<name>/<file> resources
  prompts.ts     registers one MCP prompt per skill
  tools.ts       registers list_skills / get_skill / search_skills / get_bootstrap
  auth.ts        bearer-token middleware
test/            node:test suite (skills.test.ts, auth.test.ts, server.test.ts)
```
