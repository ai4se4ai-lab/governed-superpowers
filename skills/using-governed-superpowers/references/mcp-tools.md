## MCP (remote) harness

This applies when governed-superpowers is being served by `mcp-server/` —
a standalone Model Context Protocol server that exposes the skill library to
any MCP client (e.g. VS Code / GitHub Copilot Chat connecting to a remotely
hosted instance over Streamable HTTP). MCP has no hook/event system, so this
file (concatenated onto the `using-governed-superpowers` skill body) is
served directly as the MCP server's `initialize` **instructions** field —
that satisfies the "inject at session start, no per-session opt-in"
requirement described in `docs/porting-to-a-new-harness.md`.

### Tool mapping

MCP defines three primitive kinds. This server maps skill vocabulary onto
them like this:

| Skill vocabulary | MCP mapping |
|---|---|
| *Invoke a skill* (the `Skill` tool) | Call the matching **prompt** (`prompts/get`, name = skill name, e.g. `brainstorming`) — its return value is that skill's full `SKILL.md` body, exactly like the `Skill` tool's output in Claude Code. If the client doesn't surface MCP prompts as an affordance, call the **tool** `get_skill` with the same name instead. |
| *Discover what skills exist* | Call the **tool** `list_skills` for the name + one-line description of every skill (mirrors what the bootstrap injection enumerates on other harnesses). Use `search_skills(query)` when you only remember a keyword. |
| *Read a skill's reference/script/template file* | Read the **resource** at `skill://<skill-name>/<relative-path>` (e.g. `skill://systematic-debugging/root-cause-tracing.md`). `get_skill` also lists every resource URI that belongs to a skill. |
| *Create/update a todo list* | Use whatever native task/checklist affordance the connecting client provides (e.g. VS Code's own todo/plan UI). This MCP server does not implement task tracking itself — it is a content server, not an agent runtime. |
| *Read/write/edit a file, run a shell command, search the repo* | These are actions on the **user's own workspace**, which this MCP server has no access to (it only serves this plugin's own skill content). Use the connecting client's native file/terminal/search tools for the target project. |
| *Dispatch a subagent* (`dispatching-parallel-agents`, `subagent-driven-development`) | This server cannot spawn subagents on your behalf — it has no execution context in your workspace. These two skills only work as-is on a harness whose own tools can dispatch subagents (e.g. Claude Code's `Task`/`Agent` tool). On a client without that capability, treat the skill's guidance as sequential work instead of parallel dispatch, and say so explicitly rather than silently skipping isolation. |

### What this server does and doesn't do

- It serves skill **content** (prompts, resources, the `list_skills` /
  `get_skill` / `search_skills` / `get_bootstrap` tools) — read-only,
  identical across every connecting client.
- It does **not** execute code, does **not** have access to whatever
  repository you're actually working in, and does **not** run the
  brainstorming skill's local visual-companion server
  (`skills/brainstorming/scripts/server.cjs`) — that stays a
  Claude-Code-local feature, out of scope for the MCP harness.
- Because of that, skills that assume direct workspace access (file edits,
  running tests, git operations) still rely entirely on the connecting
  client's own tools to carry them out — this server only supplies the
  instructions for *how*, per the table above.
