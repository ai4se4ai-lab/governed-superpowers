# Using the governed-superpowers MCP server

`mcp-server/` serves the governed-superpowers skill library over
[Streamable HTTP MCP](https://modelcontextprotocol.io), so any MCP client can
use every skill without installing this plugin locally. It is read-only: it
serves skill content (prompts, resources, a few lookup tools) and does not
touch your workspace or run code on your behalf — see
[`mcp-server/README.md`](../README.md) for what it exposes and how
to deploy it, and
[`skills/using-superpowers/references/mcp-tools.md`](../../skills/using-superpowers/references/mcp-tools.md)
for exactly how skill vocabulary (the `Skill` tool, task tracking, subagent
dispatch, etc.) maps onto MCP primitives on a client that has no execution
access to your repo.

You need two things before connecting from any client:

- A deployed instance's URL, e.g. `https://<your-domain>/mcp` (see
  "Docker Compose deployment" in `mcp-server/README.md`), or a local one at
  `http://localhost:3000/mcp` via `npm run dev`.
- The `MCP_SERVER_TOKEN` that instance was started with — every request must
  send it as `Authorization: Bearer <token>`.

---

## VS Code (GitHub Copilot Chat)

1. Open the Command Palette → **MCP: Add Server** (or edit `mcp.json`
   directly — Command Palette → **MCP: Open User Configuration**, or
   `.vscode/mcp.json` for a workspace-scoped config).
2. Add an entry like this:

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

3. VS Code prompts for the token once (stored securely, reused for the
   session) and connects. The status bar / MCP panel should show
   `governed-superpowers` as connected with 14 tools/prompts available.

**Example usage in Copilot Chat:**

```
@workspace /mcp.governed-superpowers.brainstorming
Let's design a rate limiter for our API gateway.
```

Or, if your Copilot Chat build doesn't surface skill prompts as slash
commands, ask directly and let the model reach for the tools:

```
Use the governed-superpowers list_skills tool to see what's available,
then use brainstorming to help me design a rate limiter for our API gateway.
```

Copilot will call `list_skills`, then `get_skill("brainstorming")` (or the
`brainstorming` prompt), read back the skill body, and follow it — asking
clarifying questions before writing any code, per that skill's instructions.

---

## Cursor

Cursor speaks MCP the same way (Streamable HTTP + bearer auth), configured
via **Settings → MCP** or a `.cursor/mcp.json` file (project-scoped) /
`~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "governed-superpowers": {
      "url": "https://<your-domain>/mcp",
      "headers": {
        "Authorization": "Bearer <your MCP_SERVER_TOKEN>"
      }
    }
  }
}
```

Cursor doesn't support the `${input:...}` prompt-for-secret syntax VS Code
does, so the token goes in the file directly — keep `.cursor/mcp.json` out of
version control if you use a project-scoped config (add it to
`.gitignore`), or use the global `~/.cursor/mcp.json` instead so it never
lives in a repo at all.

Once connected (check **Settings → MCP** for a green/connected indicator),
the skills are available as tools in Cursor's Agent/Chat mode.

**Example usage in Cursor's Agent chat:**

```
Search governed-superpowers for a skill about debugging test failures,
then use it to help me figure out why this test intermittently fails.
```

Cursor will call `search_skills("debugging")`, find `systematic-debugging`,
fetch its body via `get_skill`, and follow its process (reproduce → isolate →
root-cause, not guess-and-check) using Cursor's own file/terminal tools to
carry out the actual investigation in your workspace.

---

## Claude Code

Claude Code has first-class MCP support via the `claude mcp` CLI (or the
`/mcp` command inside a session).

**Add the server:**

```bash
claude mcp add --scope project --transport http governed-superpowers https://<your-domain>/mcp \
  --header "Authorization: Bearer <your MCP_SERVER_TOKEN>"
```

For a local dev instance:

```bash
claude mcp add --transport http governed-superpowers http://localhost:3000/mcp \
  --header "Authorization: Bearer <your MCP_SERVER_TOKEN>"
```

Check it connected:

```bash
claude mcp list
```

**Note:** if you already have this plugin installed locally in Claude Code,
its `SessionStart` hook injects the same bootstrap directly — you don't need
the MCP server too. The MCP path exists for machines/sessions where you want
the skill library available *without* installing the plugin (e.g. a
teammate's machine, a CI agent, or a lighter-weight checkout).

**Example usage in a Claude Code session** — once connected, the 14 skills
appear as MCP prompts. You can invoke one directly:

```
/mcp__governed-superpowers__brainstorming
Let's design a rate limiter for our API gateway.
```

or just ask normally and let Claude reach for the `list_skills` /
`get_skill` tools on its own:

```
I want to add caching to this service. What's the right way to approach this?
```

Because the server's `initialize` response injects the bootstrap
instructions automatically (no per-session opt-in needed, same as the
plugin's local hook), Claude Code will recognize this is creative/design
work and reach for `brainstorming` before writing any code — asking about
constraints, cache invalidation strategy, and failure modes first.

---

## Verifying a connection works (any client)

Before trusting a deployed instance from any client, confirm it's actually
serving content, not just that the port is open:

```bash
curl -sS https://<your-domain>/healthz          # expect 200
npx @modelcontextprotocol/inspector https://<your-domain>/mcp
# set transport to Streamable HTTP, add header
# Authorization: Bearer <your MCP_SERVER_TOKEN>, connect
```

Seeing the 14 skills listed as prompts and getting a real response back from
the `list_skills` tool in Inspector confirms the deployment is healthy — see
"Testing a deployed instance" in `mcp-server/README.md` for the full
checklist.
