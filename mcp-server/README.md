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

## Local development

```bash
cd mcp-server
npm install
npm run build   # tsc -> dist/
npm test        # node's built-in test runner via tsx
npm run dev      # tsx watch src/index.ts (needs MCP_SERVER_TOKEN set)
```

`npm run dev` / `npm start` need:
- `MCP_SERVER_TOKEN` - required, no default. The server refuses to start
  without it (it's meant to be reachable from the internet). Generate one
  with `openssl rand -hex 32`.
- `SKILLS_DIR` - optional, defaults to `../skills` relative to this
  package. Override if you're pointing at a different checkout.
- `PORT` - optional, defaults to `3000`.

Quick manual check once running:

```bash
curl http://localhost:3000/healthz
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
# (enter your MCP_SERVER_TOKEN as the Authorization: Bearer header in the Inspector UI)
```

## Docker Compose deployment

From the **repo root** (the build context needs to see both `mcp-server/`
and the sibling `skills/` directory):

```bash
cp .env.example .env
# edit .env: set MCP_SERVER_TOKEN (openssl rand -hex 32) and MCP_DOMAIN
docker compose up -d --build
```

This starts two services:
- `mcp-server` - the Node app from `mcp-server/Dockerfile`, not published
  to the host directly.
- `caddy` - reverse proxy that obtains a Let's Encrypt certificate for
  `MCP_DOMAIN` automatically and forwards to `mcp-server`. Requires
  `MCP_DOMAIN` to already have an A/AAAA record pointing at this host, and
  ports 80/443 open. Swap it for nginx/Traefik if you'd rather - it only
  needs to reverse-proxy to `mcp-server:3000`.

For local testing without a domain or TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build mcp-server
# now reachable at http://localhost:3000/mcp
```

**Redeploying after a skill edit**: skill content is copied into the image
at build time (`COPY skills /app/skills` in the Dockerfile), so
`docker compose up -d --build` picks up changes; there's no live-reload in
production.

### Deploying to a fresh Ubuntu host (or any other Docker host - GCP, etc.)

```bash
# on the target host
git clone <this repo>
cd governed-superpowers
cp .env.example .env
# edit .env
docker compose up -d --build
```

Point `MCP_DOMAIN`'s DNS record at the host before starting `caddy`, or its
first certificate request will fail (it retries automatically once DNS
resolves).

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
      "description": "governed-superpowers MCP_SERVER_TOKEN",
      "password": true
    }
  ]
}
```

VS Code will prompt for the token once and reuse it for the session. Once
connected, the 14 skills appear as prompts/slash commands, and `list_skills`
/ `get_skill` / `search_skills` are available as tools.

## Testing a deployed instance

Once `MCP_DOMAIN` has DNS pointed at your host and `docker compose up -d --build`
has run, verify it end-to-end:

**1. Health check (no auth):**

```bash
curl -sS https://<your-domain>/healthz
```

Expect HTTP 200. If this fails, fix DNS/Caddy/the container before testing
MCP itself.

**2. Auth sanity check:**

```bash
# no token -> should 401
curl -sS -o /dev/null -w "%{http_code}\n" https://<your-domain>/mcp

# with token -> should not 401 (400/406 depending on client is fine - it proves auth passed)
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <your MCP_SERVER_TOKEN>" \
  https://<your-domain>/mcp
```

**3. Real query via MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector https://<your-domain>/mcp
```

Set transport to Streamable HTTP, URL to `https://<your-domain>/mcp`, add
header `Authorization: Bearer <your MCP_SERVER_TOKEN>`, and connect. Seeing
the 14 skills listed as prompts and getting a response back from
`list_skills` confirms the server is live and serving content, not just that
the port is open.

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
