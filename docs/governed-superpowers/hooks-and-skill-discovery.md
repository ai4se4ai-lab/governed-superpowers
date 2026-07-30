# Hooks and Skill Discovery in governed-superpowers

Generated from the graphify knowledge graph (`graphify-out/graph.json`) plus direct
reads of the cited files. All line numbers are current as of this repo snapshot
(branch `dev-graphify-out-v0-annotation-spec-v0`, 2026-07-30).

## 1. There are no PreToolUse / PostToolUse hooks in this repo

Before answering "how are they registered/dispatched", it's worth stating the
finding plainly: **this plugin does not currently define any `PreToolUse` or
`PostToolUse` hooks.** A repo-wide search turns up exactly one match, and it's a
design doc, not code:

- `docs/superpowers/specs/2026-04-06-worktree-rototill-design.md:31` lists
  *"PreToolUse hooks for path enforcement"* under **Non-Goals — Phase 4**,
  i.e. explicitly deferred future work.

The graphify query for hook registration (`graphify query "how does the plugin
register PreToolUse and PostToolUse hooks..."`) never surfaced a `PreToolUse`/
`PostToolUse` node — it kept resolving to the one hook the graph actually knows
about: `SessionStart`. That's confirmed by the only hook manifest in the repo:

**`hooks/hooks.json`** (full file, 17 lines):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "shell": "bash",
            "async": false
          }
        ]
      }
    ]
  }
}
```

Only the `SessionStart` event is registered, triggered on `startup`, `clear`, or
`compact`. If PreToolUse/PostToolUse support is added later, it will show up as
a new top-level key in this same file (`hooks/hooks.json`).

## 2. How the SessionStart hook is wired up and dispatched

### File map

| File | Role |
|---|---|
| `hooks/hooks.json` | Declares the hook event, matcher, and the command Claude Code runs |
| `hooks/run-hook.cmd` | Cross-platform polyglot dispatcher (canonical implementation — see `docs/windows/polyglot-hooks.md:5`) |
| `hooks/session-start` | The actual hook logic (extensionless bash script) |
| `docs/windows/polyglot-hooks.md` | Explains why the dispatcher exists and how it works |
| `tests/hooks/test-session-start.sh` | Test harness for the hook (defines `pass()` L17, `fail()` L21, `cleanup()` L12, `make_home()` L26, `assert_command_output()` L33) |

### Dispatch flow

1. Claude Code (or Cursor, or Copilot CLI) starts a session and matches the
   `startup|clear|compact` matcher in `hooks/hooks.json`.
2. It runs the declared command:
   `"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start`, forced through
   `"shell": "bash"` (`hooks/hooks.json:10`).
3. `hooks/run-hook.cmd` is a **polyglot script** — the same file is valid as a
   Windows batch script *and* a POSIX shell script. Per
   `docs/windows/polyglot-hooks.md:68-70`: "Windows treats the first block as
   batch commands, while Unix shells treat that block as a no-op heredoc and
   continue after it." It resolves the hooks directory relative to its own
   location and locates a bash interpreter (tries three locations on Windows;
   see `docs/windows/polyglot-hooks.md:76-80`), then execs
   `hooks/session-start`.
4. Scripts are **extensionless by design** (`session-start`, not
   `session-start.sh`) — `docs/windows/polyglot-hooks.md:27,31` explains this
   is deliberate: Claude Code on Windows auto-prepends `bash` to any command
   containing `.sh` in its path, which would break the dispatcher if the
   target script had an extension.
5. `hooks/session-start` (bash, `set -euo pipefail` at line 4) resolves
   `PLUGIN_ROOT` from its own path (`hooks/session-start:7-8`), reads the
   bootstrap skill file at
   `${PLUGIN_ROOT}/skills/using-governed-superpowers/SKILL.md`
   (`hooks/session-start:11`), escapes it for JSON via `escape_for_json()`
   (`hooks/session-start:16-24`), and wraps it in an `<EXTREMELY_IMPORTANT>`
   block (`hooks/session-start:27`).

   > **Note on current repo state:** the skill directory that actually exists
   > on disk is `skills/using-superpowers/` (confirmed via `Glob
   > skills/*/SKILL.md`), not `skills/using-governed-superpowers/` as
   > referenced at `hooks/session-start:11`. This looks like a leftover from
   > the in-progress `Superpowers → Governed-Superpowers` rename (see commit
   > `5e8d2d0`). If this path doesn't resolve, the script's own fallback
   > (`|| echo "Error reading using-governed-superpowers skill"`) fires and an
   > error string gets injected as context instead of the real skill. Worth
   > flagging/fixing, not something to silently work around.

### Hook input/output contract

The hook takes no meaningful stdin — it's triggered purely by the `matcher` in
`hooks.json` and reads its own files off disk. The contract that matters is
**output**: `hooks/session-start:29-47` emits JSON on stdout, and the *shape*
of that JSON depends on which harness environment variables are present:

```bash
if [ -n "${CURSOR_PLUGIN_ROOT:-}" ]; then
  # Cursor: snake_case, top-level
  printf '{\n  "additional_context": "%s"\n}\n' "$session_context"
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -z "${COPILOT_CLI:-}" ]; then
  # Claude Code: nested under hookSpecificOutput
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"
else
  # Copilot CLI / SDK-standard / unknown: top-level camelCase
  printf '{\n  "additionalContext": "%s"\n}\n' "$session_context"
fi
```

A comment at `hooks/session-start:33-34` explains why the branching is
necessary rather than emitting all three fields: "Claude Code reads BOTH
`additional_context` and `hookSpecificOutput` without deduplication, so we
must emit only the field the current platform consumes." (See
`https://github.com/srvmind/governed-superpowers/issues/571` for the related
heredoc-hang bug that's why `printf` is used instead of a heredoc,
`hooks/session-start:36`.)

The injected `$session_context` string itself (`hooks/session-start:27`) is:
```
<EXTREMELY_IMPORTANT>
You have governed-superpowers.

**Below is the full content of your 'governed-superpowers:using-governed-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**

<...full SKILL.md body...>
</EXTREMELY_IMPORTANT>
```

## 3. How a skill's SKILL.md gets discovered and injected into context

There are two separate mechanisms in this repo, one per harness family, both
converging on the same underlying idea: **inject the bootstrap skill
(`using-superpowers`/`using-governed-superpowers`) at session start so the
model knows skills exist; individual skills are then loaded on demand.**

### Claude Code / Cursor / Copilot CLI (hook-based harnesses)

- **Directory convention, not a manifest field.** `.claude-plugin/plugin.json`
  (20 lines) has no `skills` key at all — it only declares `name`,
  `description`, `version`, `author`, `homepage`, `repository`, `license`,
  `keywords`. Claude Code discovers skills by convention: every
  `skills/<name>/SKILL.md` in the plugin root is registered, with the skill's
  invocable name and one-line description coming from the file's YAML
  frontmatter (e.g. `skills/using-superpowers/SKILL.md:1-4`:
  `name: using-governed-superpowers`, `description: Use when starting any
  conversation...`).
- **Bootstrap = one skill's full body injected verbatim.** Only the bootstrap
  skill (`using-superpowers`) is pushed into context automatically, by the
  `SessionStart` hook described in §2 above — its entire body is read off disk
  and embedded in the hook's JSON output. Every other skill stays on disk,
  undiscovered by the model, until the model calls the `Skill` tool by name
  (native to Claude Code) at which point that skill's `SKILL.md` content is
  loaded and presented.
- This is stated as a general design principle in
  `docs/porting-to-a-new-harness.md:49-55`: *"At the start of every session,
  the full `skills/using-governed-superpowers/SKILL.md` is injected into the
  model's context, wrapped in `<EXTREMELY_IMPORTANT>` tags, with the tool
  mapping appended. That injected skill is what teaches the model that skills
  exist... **The bootstrap is the entire integration.** Without it, the skill
  files are inert — present on disk, never invoked."*

### Pi (in-process extension harness)

Pi has no hook/event-and-stdout system; instead `.pi/extensions/superpowers.ts`
(122 lines) is loaded in-process and registers callbacks directly on the
`ExtensionAPI`:

- `resources_discover` (`.pi/extensions/superpowers.ts:19-21`) returns
  `{ skillPaths: [skillsDir] }`, where `skillsDir` is computed at
  `.pi/extensions/superpowers.ts:11` as `resolve(packageRoot, "skills")` —
  this is how Pi's native skill system finds every `SKILL.md` under
  `skills/`.
- `session_start` / `session_compact` (`.pi/extensions/superpowers.ts:23-29`)
  each set `injectBootstrap = true`; `agent_end`
  (`.pi/extensions/superpowers.ts:31-33`) sets it back to `false`.
- The actual injection happens in the `context` callback
  (`.pi/extensions/superpowers.ts:35-56`): if `injectBootstrap` is true and no
  existing message already contains the `BOOTSTRAP_MARKER` sentinel
  (`messageContainsBootstrap()`, line 100), it builds a synthetic `user`
  message from `getBootstrapContent()` and splices it into `event.messages`
  right after any leading `compactionSummary` messages
  (`firstNonCompactionSummaryIndex()`, line 115).
- `getBootstrapContent()` (`.pi/extensions/superpowers.ts:59-81`) reads
  `bootstrapSkillPath` — `resolve(skillsDir, "using-governed-superpowers",
  "SKILL.md")` (line 12) — strips YAML frontmatter (`stripFrontmatter()`,
  lines 83-86), and wraps the body with a Pi-specific tool-name mapping
  (`piToolMapping()`, lines 88-97) since Pi has no `Skill` tool and no
  `Task`/`TodoWrite` equivalents.
- Wiring into Pi itself happens via `package.json`:
  ```json
  "pi": {
    "extensions": ["./.pi/extensions/governed-superpowers.ts"],
    "skills": ["./skills"]
  }
  ```
  (`package.json:15-22`) — `pi.skills` tells Pi where the skill directory
  tree lives; `pi.extensions` tells it which file to load as the bootstrap
  extension.

  > **Note on current repo state:** `package.json:17` points at
  > `./.pi/extensions/governed-superpowers.ts`, but the file that actually
  > exists on disk is `.pi/extensions/superpowers.ts` (confirmed via `Glob
  > .pi/extensions/*`). Same pattern as the `hooks/session-start` path
  > mismatch in §2 — both look like artifacts of the in-progress
  > `governed-superpowers` rename rather than intentional.

### The general (harness-agnostic) model

`docs/porting-to-a-new-harness.md:31-77` (Part 1) frames both of the above as
instances of one pattern, split into three components any new harness
integration must supply:

1. **Skills** (`skills/*/SKILL.md`) — harness-agnostic content, shared
   verbatim.
2. **Tool mapping** — a per-harness translation of action vocabulary
   ("dispatch a subagent", "invoke a skill") into that harness's real tool
   names, e.g. `skills/using-governed-superpowers/references/<harness>-tools.md`
   or inline in the bootstrap injector (Pi's `piToolMapping()` is exactly
   this).
3. **Bootstrap** — the per-harness mechanism (hook stdout, in-process
   extension callback, or a declared instructions-file like Gemini's
   `contextFileName`) that injects the bootstrap skill's full body at session
   start with **no per-session opt-in**. Per
   `docs/porting-to-a-new-harness.md:86-90`, this is the one hard requirement
   for a harness to be portable at all.

## Sources

- Graph queries used to orient before reading source:
  `graphify query "how does the plugin register PreToolUse and PostToolUse hooks..."`,
  `graphify query "how is a skill SKILL.md discovered and injected into context"`,
  `graphify query "hooks/run-hook.cmd polyglot dispatcher session-start"`,
  `graphify query "plugin.json skills directory convention..."`,
  `graphify explain "bootstrapSkillPath"`, `graphify explain "Bootstrap Mechanism"`.
- Files read directly: `hooks/hooks.json`, `hooks/session-start`,
  `docs/windows/polyglot-hooks.md`, `.pi/extensions/superpowers.ts`,
  `package.json`, `.claude-plugin/plugin.json`,
  `skills/using-superpowers/SKILL.md`,
  `docs/porting-to-a-new-harness.md`,
  `docs/superpowers/specs/2026-04-06-worktree-rototill-design.md`.
