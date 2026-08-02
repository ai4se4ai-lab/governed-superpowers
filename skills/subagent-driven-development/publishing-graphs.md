# Publishing a collaboration graph

After a plan is finished, the work it produced can be published to the
account portal, where it renders as one sheet in the Graphs view: a few
containers (coherent chunks of the spec), each holding circles (the tasks
that delivered them), coloured by where the requirements came from.

This is opt-in, per project, and your human partner owns the decision.

## Consent comes first

Read `.governed-superpowers/sharing.json` from the project root. If it is
missing, or its `revokedAt` is not null, **stop and ask** before doing
anything else:

> I can publish this plan's collaboration graph to your Governed-Superpowers
> account — a diagram of what got built and which parts trace back to your
> input versus my own assumptions. It would send: the spec's path, the task
> titles from this plan, the files each task changed, and the requirement
> text from the spec's annotations sidecar. Want me to?

Write the file only on a clear yes. "Sure, whatever" is not a yes to
sending requirement text — if the answer is hedged, ask which parts they
are comfortable with and set the scope flags accordingly.

```json
{
  "version": 1,
  "project": {
    "slug": "evergrace-app",
    "name": "Evergrace",
    "originHash": "sha256:3f9a…"
  },
  "scope": {
    "specPaths": true,
    "substateTitles": true,
    "changePaths": true,
    "annotationText": true
  },
  "grantedAt": "2026-08-01T14:22:10Z",
  "grantedBy": "human partner, in session",
  "revokedAt": null
}
```

`originHash` is `sha256` of `git config --get remote.origin.url`, or of the
absolute repo path when there is no remote — hashed so the server never
learns their directory layout. Each `scope` flag is a per-field opt-in; a
declined flag means that field must be omitted entirely, not blanked out.
The server refuses a payload that carries a field its consent declined.

`.governed-superpowers/` is already git-ignored, so this file stays local.

**Be straight with them about what this guarantees.** The server cannot
read their disk. It checks that a well-formed, unrevoked, under-a-year-old
consent record accompanies every publish and stores it for audit. That is
an accountability trail, not an access control — do not describe it as
though the file itself is enforced remotely.

If they decline: say nothing further, do not re-offer later in the
session, and move on to finishing-a-development-branch. A previous yes to
something unrelated is not consent for this.

## Assembling the payload

1. `scripts/sdd-workspace <plan>` → the workspace. Read `progress.md`.
   Each `Task <N>: complete` line is one **substate**, key `task-N`, in
   ledger order.
2. For each completed task, read `task-N-brief.md` for its title and
   `task-N-report.md` for its status (`DONE` / `DONE_WITH_CONCERNS` /
   `BLOCKED`), commits, changed paths, and notes.
3. Find the plan's `**Reference spec:**` line, then look for
   `<spec>.annotations.json` beside that spec. For each entry, match its
   verbatim `text` against the task briefs and reports to find the task
   that implemented it, and attach it to that substate as a source.
   - Entries you cannot confidently match are **dropped and counted**, never
     reassigned to a plausible-looking task. Report the tally in
     `annotationCoverage` so a bad match rate is visible instead of hidden
     behind a confident-looking colour.
   - **If the sidecar does not exist, publish anyway with no sources.** The
     graph still shows what was built; every container renders as "no
     provenance data", which is the honest answer.
4. Cluster the substates into 2–5 **states**. This is the one genuinely
   generative step: each state names what a group of tasks accomplished
   ("address auth in connection"), not what the individual tasks were.
   Substates keep their ledger order inside a state.
5. Call `publish_graph`.

## The tools

- **`publish_graph`** — the whole payload plus the consent block.
  Re-publishing the same `spec.path` replaces that sheet's contents but
  **preserves the tab title and position** if your human partner renamed or
  reordered it. Send the spec's own title; the response tells you what is
  actually stored.
- **`list_published_graphs`** — everything published under this account,
  with scope and dates. Use it when they ask what has left their machine.
- **`revoke_published_graph`** — `{ projectSlug, specPath }` for one sheet,
  or `{ projectSlug, all: true }` for the whole project. Run it as soon as
  they withdraw consent, and set `revokedAt` in `sharing.json` too.

## Red flags

| Thought | Reality |
|---------|---------|
| "They said yes last time, so it's fine" | The consent file is the record. If it's missing or revoked, ask again. |
| "I'll publish and mention it after" | Publishing is not reversible from their side until they notice. Ask first. |
| "The sidecar's missing, I'll infer the sources" | Inferred provenance is fabricated provenance. Publish with none. |
| "This annotation probably belongs to task 3" | Probably isn't a match. Drop it and let the coverage number show. |
| "They only said no to the text, I'll send it blank" | A declined field is omitted. Don't send an empty shell of it. |
| "Low annotation coverage looks bad, I'll round up" | The number is the whole point. Report it as it is. |
