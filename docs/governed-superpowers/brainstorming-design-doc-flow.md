# How brainstorming produces its design doc

Source: [skills/brainstorming/SKILL.md](../../skills/brainstorming/SKILL.md), cross-checked against the project knowledge graph (`graphify-out/graph.json`, community 36).

## What the graph shows

`graphify explain "skills_brainstorming_skill_brainstorming_skill"` returns only two edges for the `SKILL.md` node — both `references` edges, both EXTRACTED (not inferred):

- `SKILL.md` → `skills/brainstorming/visual-companion.md` ("If they agree to the companion, read the detailed guide before proceeding")
- `SKILL.md` → `skills/brainstorming/spec-document-reviewer-prompt.md` ("Dispatch after: Spec document is written to docs/governed-superpowers/specs/")

The second edge is misleading on its own: it comes from `spec-document-reviewer-prompt.md`'s own text, not from `SKILL.md` calling out to it. A direct grep of `SKILL.md` for `spec-document-reviewer` returns no matches — **`SKILL.md`'s checklist never invokes that reviewer template.** The template file exists in the skill's directory as a standalone subagent-dispatch pattern but is not currently wired into the brainstorming flow. The skill's actual "spec self-review" step (below) is a lighter inline check, not a subagent dispatch.

## What triggers the write

The write is step 6 of the mandatory checklist at [SKILL.md:20-32](../../skills/brainstorming/SKILL.md#L20-L32):

```
6. Write design doc — save to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
```

This step only fires after step 5, "Present design ... get user approval after each section" — the process-flow diagram at [SKILL.md:36-59](../../skills/brainstorming/SKILL.md#L36-L59) makes the gate explicit: the "User approves design?" decision node loops back to "Present design sections" on "no, revise" and only proceeds to "Write design doc" on "yes". So the trigger isn't a keyword or a fixed message — it's the agent's own judgment that the user has approved the presented design in conversation.

## Where the write instruction lives

The authoritative instruction (with the caveat that user preference can override it) is under "After the Design" → "Documentation" at [SKILL.md:105-110](../../skills/brainstorming/SKILL.md#L105-L110):

```
- Write the validated design (spec) to `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git
```

There is no separate script or template file that generates the doc — `SKILL.md` does not point to a doc-generation tool. The agent itself composes the markdown from the conversation and writes it with its own file-write tool, following the "Presenting the design" guidance from earlier in the skill.

## What the output file looks like

`SKILL.md` doesn't ship a literal template for the spec file, but it fully specifies the file's shape through the "Presenting the design" section at [SKILL.md:82-88](../../skills/brainstorming/SKILL.md#L82-L88), which the written doc mirrors:

- Sections scaled to their complexity — "a few sentences if straightforward, up to 200-300 words if nuanced"
- Required coverage: **architecture, components, data flow, error handling, testing**
- The filename itself is fixed: `YYYY-MM-DD-<topic>-design.md`, dropped into `docs/governed-superpowers/specs/`

An example of this shape already in the repo (found via the graph's broader traversal, not this skill's own output) is `docs/superpowers/specs/2026-01-22-document-review-system-design.md`, from an older `docs/superpowers/` path convention — the current skill target is `docs/governed-superpowers/specs/`, which as of this session contains only `hooks-and-skill-discovery.md` (no dated spec files yet).

## Where user messages become doc content

There is no transcription step — the doc is synthesized, not copied. The pipeline from conversation to file is:

1. **Steps 1-4 of the checklist** ([SKILL.md:20-32](../../skills/brainstorming/SKILL.md#L20-L32)) — exploring context, asking one clarifying question per message, proposing 2-3 approaches — accumulate the raw material entirely inside the conversation. None of this is written to disk yet.
2. **Step 5, "Present design"** ([SKILL.md:82-88](../../skills/brainstorming/SKILL.md#L82-L88)) — the agent turns that conversation into structured sections (architecture, components, data flow, error handling, testing) and presents them to the user *in chat*, asking after each section "does this look right so far?" This is the first point where the scattered answers get organized into doc-like form, but still only as chat text.
3. **Step 6, "Write design doc"** — once every section has been approved in conversation, the agent writes the now-approved section content to the spec file at `docs/governed-superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commits it. The file content is effectively the approved chat presentation, persisted.
4. **Step 7, "Spec self-review"** ([SKILL.md:112-120](../../skills/brainstorming/SKILL.md#L112-L120)) — the agent re-reads its own just-written file "with fresh eyes" and fixes placeholders, contradictions, scope problems, and ambiguity **inline**, without a review loop or subagent dispatch (contrary to what the graph's edge to `spec-document-reviewer-prompt.md` might suggest — that template is unused by this flow).
5. **Step 8, "User reviews written spec"** ([SKILL.md:122-127](../../skills/brainstorming/SKILL.md#L122-L127)) — the agent posts a fixed-form message ("Spec written and committed to `<path>`. Please review it...") and waits; requested changes send it back to step 6 to rewrite the file.
6. **Step 9** — only after the user approves the on-disk spec does the skill hand off, invoking `writing-plans` as its sole permitted next step ([SKILL.md:61](../../skills/brainstorming/SKILL.md#L61), [SKILL.md:129-132](../../skills/brainstorming/SKILL.md#L129-L132)).

So the design doc is never a direct dump of user messages — every line in it has already passed through one chat-visible approval cycle (step 5) before it's persisted (step 6), then a second silent self-review pass (step 7), then a second user approval gate on the file itself (step 8).

## Related file: the visual companion

The one other file `SKILL.md` explicitly points to — confirmed by both the graph edge and a direct read — is `skills/brainstorming/visual-companion.md`, referenced at [SKILL.md:150-151](../../skills/brainstorming/SKILL.md#L150-L151): "If they agree to the companion, read the detailed guide before proceeding." This governs an optional browser-based mockup/diagram tool used *during* the questioning phase; it has no role in writing the spec file itself.
