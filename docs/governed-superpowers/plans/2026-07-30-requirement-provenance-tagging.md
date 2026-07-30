# Requirement Provenance Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skills/brainstorming/SKILL.md` tag every requirement in a written spec with a provenance source (human / ai_assumption / skill_doc / tool_output / existing_codebase / external_reference), via markdown footnote markers in the spec plus a same-basename `spec.annotations.json` sidecar.

**Architecture:** A new "Provenance Tagging" section is appended to `skills/brainstorming/SKILL.md` (after the existing "Visual Companion" section) holding the taxonomy, marker format, and sidecar schema. Four existing prose blocks (Exploring approaches, Presenting the design, Documentation, Spec Self-Review) each get one added bullet/item pointing to that section — no rewrite of existing prose. This is a documentation-only change to a prose skill file; there is no application code and no automated test suite.

**Tech Stack:** Markdown (`SKILL.md`), JSON (sidecar format defined but not code-generated — the agent writes it by hand at runtime).

**Reference spec:** `docs/governed-superpowers/specs/2026-07-30-requirement-provenance-tagging-design.md`

---

### Task 1: Add the "Provenance Tagging" section to SKILL.md

**Files:**
- Modify: `skills/brainstorming/SKILL.md` (append new `## Provenance Tagging` section after the existing `## Visual Companion` section, i.e. after line 151, which currently reads `` `skills/brainstorming/visual-companion.md` ``)

- [ ] **Step 1: Read the current end of the file to confirm the exact anchor text**

Run: `tail -5 skills/brainstorming/SKILL.md`

Expected output (current file ends at line 152):
```
If they agree to the companion, read the detailed guide before proceeding:
`skills/brainstorming/visual-companion.md`
```

- [ ] **Step 2: Append the new section**

Add this text to the end of `skills/brainstorming/SKILL.md`, exactly as written:

```markdown

## Provenance Tagging

Every discrete requirement written into a spec — a testable "must"/"shall"/"will" statement about what the system does — gets tagged with exactly one provenance source. Architecture rationale, trade-off discussion, and narrative connective text are left untagged.

**Source taxonomy:**

| source | meaning | `ref` field |
|---|---|---|
| `human` | verbatim user input given during this session | `null` |
| `ai_assumption` | agent-inferred, with nothing else grounding it — the default when no other source applies | `null` |
| `skill_doc` | grounded in a skill file or other project doc | file path, e.g. `skills/brainstorming/SKILL.md:107-110` |
| `tool_output` | grounded in output from graphify or another tool/plugin | the command run, e.g. `graphify explain "brainstorming_skill"` |
| `existing_codebase` | grounded in an existing pattern found in the repo | file:line, e.g. `skills/brainstorming/visual-companion.md:12` |
| `external_reference` | grounded in a web search or fetched external doc | URL |

User messages are always `human`, verbatim — no classification judgment needed. Everything else is tagged as it's written, defaulting to `ai_assumption` when nothing else grounds it.

**Marker format:** standard sequential markdown footnotes (`[^1]`, `[^2]`, ...) in document order, in the spec file itself. No source-type encoding in the marker — the source lives only in the sidecar.

**When to tag:** as each requirement is drafted (during "Propose approaches" and "Present design"), decide its source and show the marker inline in the chat presentation with the source spelled out, so the user can review provenance before approving — e.g. `"The CLI must support --dry-run.[^3: ai_assumption]"`. If a requirement is revised after initial tagging (a "no, revise" or "changes requested" loop), re-evaluate its source against the new wording; if the original grounding no longer applies, re-tag it, typically reverting to `ai_assumption` unless the user's edit itself supplied new grounding.

**Sidecar file:** every written spec gets a same-basename sidecar, swapping `.md` for `.annotations.json` — e.g. `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md` pairs with `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.annotations.json`. It's a flat JSON object keyed by marker number as a string:

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

`text` is the literal, full requirement sentence copied verbatim from the spec — not a paraphrase. Write the `.md` and its `.annotations.json` together, as one atomic step; if either write fails, neither is considered committed.

**Self-review check:** every `[^N]` marker in the spec must have a matching key in the sidecar, and every sidecar key must have a matching marker in the spec — no orphans either direction. Fix any gap inline (default `ai_assumption` if no better source applies), same as the other self-review checks — no separate re-review loop.
```

- [ ] **Step 3: Verify the section was appended correctly**

Run: `tail -40 skills/brainstorming/SKILL.md`
Expected: the new `## Provenance Tagging` heading and full section content appear at the end of the file, with no truncation and no stray heading levels (single `##` for the section, `**bold**` for sub-labels, matching the style of the `## Visual Companion` section above it).

- [ ] **Step 4: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "docs: add Provenance Tagging section to brainstorming skill"
```

---

### Task 2: Point the checklist and process-flow prose at the new section

**Files:**
- Modify: `skills/brainstorming/SKILL.md:29-32` (checklist items 6 and 7)
- Modify: `skills/brainstorming/SKILL.md:77-80` (Exploring approaches bullets)
- Modify: `skills/brainstorming/SKILL.md:82-88` (Presenting the design bullets)
- Modify: `skills/brainstorming/SKILL.md:107-110` (Documentation bullets)
- Modify: `skills/brainstorming/SKILL.md:112-120` (Spec Self-Review numbered list)

- [ ] **Step 1: Update checklist items 6 and 7**

Find this exact text (checklist, currently lines 29-32):

```markdown
6. **Write design doc** — save to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
```

Replace with:

```markdown
6. **Write design doc** — save to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md` with its `.annotations.json` sidecar, and commit both (see Provenance Tagging below)
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope, and provenance marker/sidecar consistency (see below)
```

- [ ] **Step 2: Update "Exploring approaches"**

Find this exact text:

```markdown
**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why
- YAGNI ruthlessly - remove unnecessary features from all designs
```

Replace with:

```markdown
**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why
- YAGNI ruthlessly - remove unnecessary features from all designs
- Tag each requirement with a provenance source as you draft it — see Provenance Tagging below
```

- [ ] **Step 3: Update "Presenting the design"**

Find this exact text:

```markdown
**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense
```

Replace with:

```markdown
**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense
- Show each requirement's provenance marker inline in chat as you present it — see Provenance Tagging below
```

- [ ] **Step 4: Update "Documentation"**

Find this exact text:

```markdown
**Documentation:**

- Write the validated design (spec) to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git
```

Replace with:

```markdown
**Documentation:**

- Write the validated design (spec) to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
- Write the matching `.annotations.json` sidecar alongside it, in the same write — see Provenance Tagging below
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document and its sidecar to git
```

- [ ] **Step 5: Update "Spec Self-Review"**

Find this exact text:

```markdown
**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.
```

Replace with:

```markdown
**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.
5. **Provenance check:** Does every requirement's footnote marker resolve to an entry in the `.annotations.json` sidecar, and does every sidecar entry have a matching marker in the spec? Fix any gap inline (default `ai_assumption`) — see Provenance Tagging below.

Fix any issues inline. No need to re-review — just fix and move on.
```

- [ ] **Step 6: Verify all five edits landed**

Run: `grep -n "Provenance Tagging below" skills/brainstorming/SKILL.md`
Expected: 5 matches (checklist item 6/7 doesn't repeat the phrase — recount: Exploring approaches, Presenting the design, Documentation, Spec Self-Review = 4 matches from Steps 2-5; checklist item 6 in Step 1 also references "(see Provenance Tagging below)" = 5 total).

- [ ] **Step 7: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "docs: wire provenance tagging into brainstorming checklist steps"
```

---

### Task 3: Manual dry-run verification

**Files:** none modified — this task only verifies Tasks 1-2.

- [ ] **Step 1: Full read-through of the edited file**

Run: `cat skills/brainstorming/SKILL.md`
Expected: the file reads coherently top to bottom — checklist items 6/7 mention provenance, the four prose blocks each have their one added bullet, and the new `## Provenance Tagging` section is well-formed markdown (headings, table, code fences all balanced).

- [ ] **Step 2: Run a real brainstorming session as a smoke test**

Start a fresh session and ask the brainstorming skill to design something small and concrete (e.g. "let's add a `--verbose` flag to some CLI tool"). Confirm:
- Requirements shown in chat during "Present design" carry an inline marker + source, e.g. `[^2: ai_assumption]`.
- The written spec file has `[^N]` footnote markers on requirement sentences only (not on prose).
- A sidecar `*.annotations.json` file exists next to it with matching keys, each with `source`, `ref`, `text`.
- Spec self-review (step 7) doesn't leave any marker/sidecar mismatch.

Record the resulting spec + sidecar file paths in the task notes for the code reviewer to spot-check.

- [ ] **Step 3: Adversarial case — long design, many requirements**

Repeat Step 2 with a deliberately larger design (10+ requirements) to check the tagging discipline doesn't degrade under length, and that step 7's self-review actually catches an untagged requirement if you manually strip one marker from the draft before the self-review pass runs.

- [ ] **Step 4: Confirm no regression to plain-English readability**

Read the smoke-test spec's `.md` file ignoring the footnote markers entirely. Expected: it reads as a normal, complete spec — the markers must not disrupt sentence flow or force awkward phrasing.

---

## Self-Review Notes (for the plan author, not the executor)

- **Spec coverage:** Source taxonomy → Task 1. Marker format → Task 1. Sidecar schema → Task 1. Data flow (drafting/approval/write/self-review) → Task 1 (section content) + Task 2 (wiring into steps 4-7). Error handling (mismatch, ambiguous source, revision re-tagging, out-of-scope drift) → Task 1 section content covers mismatch/revision/ambiguity; out-of-scope drift needs no implementation (explicitly not built). Testing section of the spec → Task 3.
- **Placeholder scan:** none found.
- **Type consistency:** the sidecar schema (`source`/`ref`/`text` keys, string-keyed marker numbers) is identical between Task 1's section text and the JSON examples — verified matching.
