# Requirement provenance tagging for brainstorming specs

## Problem

Design docs produced by the `brainstorming` skill mix requirements from very different levels of trust — a user's verbatim ask, an agent's unstated assumption, a fact grounded in another skill file, a fact grounded in graphify or another tool's output, a pattern copied from the existing codebase, or a claim from an external doc — with no way for a reader to tell which is which after the fact. Reviewers (and future sessions) currently have to re-derive that trust level from memory or by re-reading the whole conversation.

## Design

### Source taxonomy

Every requirement written into a spec is tagged with exactly one of six source types:

| source | meaning | `ref` field |
|---|---|---|
| `human` | verbatim user input given during this session | omitted or `"user message"` |
| `ai_assumption` | agent-inferred, with nothing else grounding it — the default when no other source applies | omitted |
| `skill_doc` | grounded in a skill file or other project doc | file path, e.g. `skills/brainstorming/SKILL.md:107-110` |
| `tool_output` | grounded in output from graphify or another tool/plugin | the command run, e.g. `graphify explain "brainstorming_skill"` |
| `existing_codebase` | grounded in an existing pattern found in the repo | file:line, e.g. `skills/brainstorming/visual-companion.md:12` |
| `external_reference` | grounded in a web search or fetched external doc | URL |

User messages are always `human`, verbatim — no classification judgment needed for that case. Everything the agent writes is tagged as it's written, defaulting to `ai_assumption` when nothing else grounds it.

### File format

`spec.md` stays human-readable: requirements get standard sequential markdown footnote markers (`[^1]`, `[^2]`, ...) in document order, no source-type encoding in the marker itself. The actual source/ref/text lives in a same-basename sidecar, `spec.annotations.json`, keyed by marker number as a string:

```json
{
  "1": {
    "source": "human",
    "ref": null,
    "text": "every requirement must be tagged with a provenance source"
  },
  "2": {
    "source": "existing_codebase",
    "ref": "skills/brainstorming/SKILL.md:107-110",
    "text": "Write the validated design (spec) to docs/.../specs/YYYY-MM-DD-<topic>-design.md"
  }
}
```

`text` is the literal, full requirement sentence copied verbatim from the `.md` — not a paraphrase — so the JSON is self-sufficient without the `.md` open.

Concretely, for a spec written to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md`, the sidecar is `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.annotations.json`.

### Scope of tagging

Only discrete requirement statements (testable "must"/"shall"/"will" statements about what the system does) get tagged. Architecture rationale, trade-off discussion, and narrative connective text are left untagged — tagging every sentence in the doc would bury the signal in noise.

### Where this lives in SKILL.md

A new, dedicated **"Provenance Tagging"** section is added to `skills/brainstorming/SKILL.md`, positioned after the existing "Visual Companion" section, following the same self-contained-section pattern already used there. It holds the taxonomy table, marker format, and sidecar schema shown above.

The existing checklist steps each get a one-line pointer added (no rewrite of their existing prose):

- **Step 4 (Propose approaches)** and **Step 5 (Present design)** — point to the new section for how to tag a requirement as it's drafted.
- **Step 6 (Write design doc)** — point to the new section for the sidecar-write requirement.
- **Step 7 (Spec self-review)** — point to the new section for the marker/entry consistency check (see Error handling below).

## Data flow

1. **Drafting (steps 4–5).** As the agent composes each requirement sentence in chat, it decides the source type in the moment. It assigns the next sequential marker and shows it inline in the chat presentation, with the source spelled out next to it so the user can review provenance without opening a JSON file — e.g. `"The CLI must support --dry-run.[^3: ai_assumption]"`.
2. **Approval (step 5 gate, unchanged).** The user approves each section as today. Because the source is now visible inline, this approval implicitly covers the shown provenance too — a bad `ai_assumption` tag on something that should have been grounded is now visible before the file exists.
3. **Write (step 6).** The agent writes `spec.md` (with `[^N]` markers) and `spec.annotations.json` (with the matching entries) together, as one atomic step. If either write fails, neither file is considered committed.
4. **Self-review (step 7).** The existing four checks (placeholder scan, internal consistency, scope check, ambiguity check) run unchanged, plus a fifth: every `[^N]` marker in the `.md` has a matching key in the `.json`, and every key in the `.json` has a matching marker in the `.md` — no orphans either direction. Any gap found is fixed inline (tagged `ai_assumption` if no better source applies), same as the other four checks — no separate re-review loop.
5. **User spec review (step 8, unchanged).** The user reviews the `.md`; the `.annotations.json` sidecar is committed in the same commit alongside it.

## Error handling

- **Marker/entry mismatch** — caught and fixed by the step 7 self-review check before the user ever sees it; never surfaces as a user-facing error.
- **Ambiguous source** (a requirement could plausibly fit two source types) — the agent picks the most specific applicable one without asking the user to adjudicate per-requirement (e.g. a fact grounded in a specific file beats a fact grounded in "the docs generally"). Not worth a clarifying question for every requirement.
- **Requirement revised after initial tagging** (step 5 "no, revise" loop, or step 8 "changes requested") — the marker's source is re-evaluated against the new text. If the original grounding no longer applies to the revised wording, it's re-tagged, typically reverting to `ai_assumption` unless the user's edit itself supplied new grounding.
- **Sidecar drift from manual, out-of-band edits to the `.md`** — out of scope. This mechanism only governs the brainstorming skill's own write path; it does not add drift detection for hand-edited files.

## Testing

This is a behavioral change to a skill's prose instructions, not to code, so verification follows the project's own bar for skill-content changes (per this repo's `CLAUDE.md`: skill changes require eval evidence via `governed-superpowers:writing-skills` and adversarial pressure testing before being accepted):

- **Manual dry run** — run `brainstorming` end-to-end on a small real feature; confirm every requirement in the resulting spec has a marker, every marker resolves in the sidecar, and spot-check a few source classifications for correctness (e.g. a requirement copied from an existing file should land as `existing_codebase`, not `ai_assumption`).
- **Adversarial case** — a session with a long design and many requirements, where skipping tagging would be tempting; confirm the step 7 self-review check actually catches an untagged requirement rather than rubber-stamping the doc.
- **Regression check** — confirm `spec.md` alone, footnotes ignored, is still fully readable as a plain-English spec. Tagging must not degrade the doc's primary purpose.

No automated test suite is proposed; this mirrors how the rest of `SKILL.md`'s behavior (e.g. the visual companion offer, one-question-at-a-time) is verified today — through the eval harness (`evals/`) and human read-through, not unit tests.

## Prior art check

Before proposing this mechanism, the project knowledge graph was queried for any existing provenance or telemetry tracking in the brainstorming skill that this might duplicate or conflict with. Two vocabulary hits surfaced (`provenance`, `telemetry`), both unrelated:

- `telemetry` refers only to `TELEMETRY_DISABLE_ENV_VARS` / `SUPERPOWERS_TELEMETRY_DISABLED` in `skills/brainstorming/scripts/server.cjs` — an opt-out for the visual companion's own usage-analytics beacon, not requirement provenance.
- `provenance` appears once, in `docs/superpowers/specs/2026-04-06-worktree-rototill-design.md`, in an unrelated concept ("Provenance-Based Cleanup") for a different feature entirely.

No existing mechanism tracks *why or where a requirement came from* — this is new.
