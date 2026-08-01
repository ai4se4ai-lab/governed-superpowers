# Governed-Superpowers

Governed-Superpowers is a complete software development methodology for your coding agents, built on top of a set of composable skills and some initial instructions that make sure your agent uses them.


## Quickstart

Give your agent Governed-Superpowers: [Claude Code](#claude-code), [Antigravity](#antigravity), [Codex App](#codex-app), [Codex CLI](#codex-cli), [Cursor](#cursor), [Factory Droid](#factory-droid), [Gemini CLI](#gemini-cli), [GitHub Copilot CLI](#github-copilot-cli), [Kimi Code](#kimi-code), [OpenCode](#opencode), [Pi](#pi).

## How it works

It starts from the moment you fire up your coding agent. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do. 

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest. 

After you've signed off on the design, your agent puts together an implementation plan that's clear enough for an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing to follow. It emphasizes true red/green TDD, YAGNI (You Aren't Gonna Need It), and DRY. 

Next up, once you say "go", it launches a *subagent-driven-development* process, having agents work through each engineering task, inspecting and reviewing their work, and continuing forward. It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together.

There's a bunch more to it, but that's the core of the system. And because the skills trigger automatically, you don't need to do anything special. Your coding agent just has Governed-Superpowers.

## Commercial Services

If you're using Governed-Superpowers in enterprise and could benefit from commercial support, additional tooling, or managed spending, please don't hesitate to drop us a line at sales@primeradiant.com.

## Installation

Installation differs by harness. If you use more than one, install Governed-Superpowers separately for each one.

### Claude Code

Governed-Superpowers is available via the [official Claude plugin marketplace](https://claude.com/plugins/governed-superpowers)

#### Official Marketplace

- Install the plugin from Anthropic's official marketplace:

  ```bash
  /plugin install governed-superpowers@claude-plugins-official
  ```

#### Governed-Superpowers Marketplace

The Governed-Superpowers marketplace provides Governed-Superpowers and some other related plugins for Claude Code.

- Register the marketplace:

  ```bash
  /plugin marketplace add srvmind/governed-superpowers-marketplace
  ```

- Install the plugin from this marketplace:

  ```bash
  /plugin install governed-superpowers@governed-superpowers-marketplace
  ```

### Antigravity

Install Governed-Superpowers as a plugin from this repository:

```bash
agy plugin install https://github.com/srvmind/governed-superpowers
```

Antigravity runs the plugin's session-start hook, so Governed-Superpowers is active from
the first message. Reinstall with the same command to update.

### Codex App

Governed-Superpowers is available via the [official Codex plugin marketplace](https://github.com/openai/plugins).

- In the Codex app, click on Plugins in the sidebar.
- You should see `Governed-Superpowers` in the Coding section.
- Click the `+` next to Governed-Superpowers and follow the prompts.

### Codex CLI

Governed-Superpowers is available via the [official Codex plugin marketplace](https://github.com/openai/plugins).

- Open the plugin search interface:

  ```bash
  /plugins
  ```

- Search for Governed-Superpowers:

  ```bash
  governed-superpowers
  ```

- Select `Install Plugin`.

### Cursor

- In Cursor Agent chat, install from marketplace:

  ```text
  /add-plugin governed-superpowers
  ```

- Or search for "governed-superpowers" in the plugin marketplace.

### Factory Droid

- Register the marketplace:

  ```bash
  droid plugin marketplace add https://github.com/srvmind/governed-superpowers
  ```

- Install the plugin:

  ```bash
  droid plugin install governed-superpowers@governed-superpowers
  ```

### Gemini CLI

- Install the extension:

  ```bash
  gemini extensions install https://github.com/srvmind/governed-superpowers
  ```

- Update later:

  ```bash
  gemini extensions update governed-superpowers
  ```

### GitHub Copilot CLI

- Register the marketplace:

  ```bash
  copilot plugin marketplace add srvmind/governed-superpowers-marketplace
  ```

- Install the plugin:

  ```bash
  copilot plugin install governed-superpowers@governed-superpowers-marketplace
  ```

### Kimi Code

Governed-Superpowers is available in Kimi Code's plugin marketplace.

- Open Kimi Code's plugin manager:

  ```text
  /plugins
  ```

- Go to `Marketplace` > `Governed-Superpowers` and install it.

- Or install directly from this repository:

  ```text
  /plugins install https://github.com/srvmind/governed-superpowers
  ```

- Detailed docs: [docs/README.kimi.md](docs/README.kimi.md)

### OpenCode

OpenCode uses its own plugin install; install Governed-Superpowers separately even if you
already use it in another harness.

- Tell OpenCode:

  ```
  Fetch and follow instructions from https://raw.githubusercontent.com/srvmind/governed-superpowers/refs/heads/main/.opencode/INSTALL.md
  ```

- Detailed docs: [docs/README.opencode.md](docs/README.opencode.md)

### Pi

Install Governed-Superpowers as a Pi package from this repository:

```bash
pi install git:github.com/srvmind/governed-superpowers
```

For local development, run Pi with this checkout loaded as a temporary package:

```bash
pi -e /path/to/governed-superpowers
```

The Pi package loads the Governed-Superpowers skills and a small extension that injects the `using-governed-superpowers` bootstrap at session startup and again after compaction. Pi has native skills, so no compatibility `Skill` tool is required. Subagent and task-list tools remain optional Pi companion packages.

## Self-hosting: account portal + MCP server

Everything above installs Governed-Superpowers *locally*, per harness. If you'd
rather serve the skill library over the network — so a teammate, a CI agent, or
a machine without this plugin installed can use every skill — this repo also
ships a deployable stack:

- **`mcp-server/`** — serves all 14 skills over
  [Streamable HTTP MCP](https://modelcontextprotocol.io). Read-only: it serves
  skill content and never touches your workspace.
- **`web/`** — a self-serve account portal. Users sign up, confirm their address
  from an emailed invitation link, manage their profile, and mint or revoke
  their own MCP tokens.

Tokens are per-user, optionally expiring, and independently revocable. There is
no shared static secret: `mcp-server` validates every bearer token against the
portal's database, so revoking a token in the UI cuts that client off on its
very next request.

### Run it locally

```bash
cp .env.example .env
# fill in POSTGRES_PASSWORD, DATABASE_URL, and real SMTP_* creds (there is no
# bundled dev mail sink - confirmation email needs a real provider even locally)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d web mcp-server
```

| | |
|---|---|
| Account portal | <http://localhost:3000> |
| MCP endpoint | `http://localhost:3001/mcp` |

Sign up at the portal, click the confirmation link from the email, sign in,
then mint a token on the **Tokens** page. Point any MCP client at the endpoint
with that token:

```bash
claude mcp add --transport http governed-superpowers http://localhost:3001/mcp \
  --header "Authorization: Bearer <your token>"
```

### Deploy it

```bash
docker compose up -d db
docker compose run --rm migrate
docker compose up -d --build
```

Or use the wrapper script, which also supports a Supabase-hosted Postgres
instead of the bundled `db` container:

```bash
scripts/docker-up.sh --db local --build    # bundled Postgres (default)
scripts/docker-up.sh --db cloud --build    # Supabase - requires DATABASE_URL
                                            # and SUPABASE_DB_URL in .env
```

(`scripts/docker-up.ps1` on Windows, same flags.) Extra flags
(`--force-recreate`, `--remove-orphans`, ...) pass straight through to
`docker compose up`.

This brings up the full stack behind Caddy, which obtains a Let's Encrypt
certificate for `APP_DOMAIN` and path-routes `/mcp` to the MCP server and
everything else to the portal. Point `SMTP_*` at a real mail provider so
confirmation emails actually arrive - there is no bundled mail sink.

See [`mcp-server/README.md`](mcp-server/README.md) for deployment and
verification steps, and
[`mcp-server/docs/using-mcp-server.md`](mcp-server/docs/using-mcp-server.md)
for client setup in VS Code, Cursor and Claude Code.

### Deploy to Google Cloud Run

```bash
python scripts/gcp-deploy.py
```

Builds and deploys `web` and `mcp-server` as two independent Cloud Run
services (each gets its own URL - there's no single-domain path routing on
Cloud Run the way Caddy does it locally). Requires `GCP_PROJECT_ID` and
`DATABASE_URL` in `.env`; see the comment block at the top of
`scripts/gcp-deploy.py` for every config key it reads.

> **Upgrading an existing deployment:** `MCP_SERVER_TOKEN` has been removed.
> Bring up the new stack, sign up, mint a token, and update your clients — the
> old shared token no longer authenticates.

## The Basic Workflow

1. **brainstorming** - Activates before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. Saves design document.

2. **using-git-worktrees** - Activates after design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline.

3. **writing-plans** - Activates with approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code, verification steps.

4. **subagent-driven-development** or **executing-plans** - Activates with plan. Dispatches fresh subagent per task with two-stage review (spec compliance, then code quality), or executes in batches with human checkpoints.

5. **test-driven-development** - Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit. Deletes code written before tests.

6. **requesting-code-review** - Activates between tasks. Reviews against plan, reports issues by severity. Critical issues block progress.

7. **finishing-a-development-branch** - Activates when tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

## What's Inside

### Skills Library

**Testing**
- **test-driven-development** - RED-GREEN-REFACTOR cycle (includes testing anti-patterns reference)

**Debugging**
- **systematic-debugging** - 4-phase root cause process (includes root-cause-tracing, defense-in-depth, condition-based-waiting techniques)
- **verification-before-completion** - Ensure it's actually fixed

**Collaboration** 
- **brainstorming** - Socratic design refinement
- **writing-plans** - Detailed implementation plans
- **executing-plans** - Batch execution with checkpoints
- **dispatching-parallel-agents** - Concurrent subagent workflows
- **requesting-code-review** - Pre-review checklist
- **receiving-code-review** - Responding to feedback
- **using-git-worktrees** - Parallel development branches
- **finishing-a-development-branch** - Merge/PR decision workflow
- **subagent-driven-development** - Fast iteration with two-stage review (spec compliance, then code quality)

**Meta**
- **writing-skills** - Create new skills following best practices (includes testing methodology)
- **using-governed-superpowers** - Introduction to the skills system

## Philosophy

- **Test-Driven Development** - Write tests first, always
- **Systematic over ad-hoc** - Process over guessing
- **Complexity reduction** - Simplicity as primary goal
- **Evidence over claims** - Verify before declaring success

Read [the original release announcement](https://blog.fsck.com/2025/10/09/governed-superpowers/).

## Contributing

The general contribution process for Governed-Superpowers is below. Keep in mind that we don't generally accept contributions of new skills and that any updates to skills must work across all of the coding agents we support.

1. Fork the repository
2. Switch to the 'dev' branch
3. Create a branch for your work
4. Follow the `writing-skills` skill for creating and testing new and modified skills
5. Submit a PR, being sure to fill in the pull request template.

Skill-behavior tests use the drill eval harness from [governed-superpowers-evals](https://github.com/prime-radiant-inc/governed-superpowers-evals/), cloned into `evals/` — see `evals/README.md` for setup. Plugin-infrastructure tests live at `tests/` and run via the relevant `run-*.sh` or `npm test`.

See `skills/writing-skills/SKILL.md` for the complete guide.

## Updating

Governed-Superpowers updates are somewhat coding-agent dependent, but are often automatic.

## License

MIT License - see LICENSE file for details

## Visual companion telemetry

Because skills and plugins don't provide any feedback to creators, we have no idea how many of you are using Governed-Superpowers. By default, the Prime Radiant logo on brainstorming's optional visual companion feature is loaded from our website. It includes the version of Governed-Superpowers in use. It does not include any details about your project, prompt, or coding agent. We don't see your clicks or anything about what you're building. This helps us have a rough idea of how many folks are using Governed-Superpowers and which version of Governed-Superpowers they're using. It's 100% optional. To disable this, set the environment variable `SUPERPOWERS_DISABLE_TELEMETRY` to any true value. Governed-Superpowers also honors Claude Code's `DISABLE_TELEMETRY` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` opt-outs.

## Community

Governed-Superpowers is built by [Majid Babaei](https://blog.fsck.com) and the rest of the folks at [Prime Radiant](https://primeradiant.com).

- **Discord**: [Join us](https://discord.gg/35wsABTejz) for community support, questions, and sharing what you're building with Governed-Superpowers
- **Issues**: https://github.com/srvmind/governed-superpowers/issues
- **Release announcements**: [Sign up](https://primeradiant.com/governed-superpowers/) to get notified about new versions
