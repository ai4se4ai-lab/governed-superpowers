# Publishing a collaboration graph

From the start of `subagent-driven-development`, the work a plan produces
can be published live to the account portal, where it renders as one sheet
in the Graphs view: a few containers (coherent chunks of the spec), each
holding circles (the tasks that delivered them), coloured by where the
requirements came from. The sheet updates after every completed task, not
just once at the end.

This is opt-in, per project, and your human partner owns the decision.

## Consent comes first

This check happens twice: once at SDD Setup, before Task 1 dispatches, and
again automatically inside `scripts/sdd-publish` before every later publish
call — a mid-plan revocation must stop the very next update, not just the
next plan.

Read `.governed-superpowers/sharing.json` from the project root. If it is
missing, or its `revokedAt` is not null, **stop and ask** before doing
anything else:

> I can publish this plan's collaboration graph to your Governed-Superpowers
> account as it happens — a live diagram of what's getting built and which
> parts trace back to your input versus my own assumptions, updating after
> every completed task. It would send: the spec's path, the task titles
> from this plan, the files each task changed, and the requirement text
> from the spec's annotations sidecar. Want me to?

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

Run this after the Setup skeleton call and again after every
`Task <N>: complete` ledger line (clean or parked-at-cap):

1. Run `scripts/sdd-publish <plan>`. It re-checks `sharing.json` for
   revocation (skipping silently if revoked), then prints a bundle: for
   every completed task, its commit range, the `task-N-brief.md` and
   `task-N-report.md` paths, and a `git diff --stat` over that range. It
   also prints the spec's `.annotations.json` sidecar path if one exists,
   without opening it. The script never interprets this material.
2. Read the bundle. For each task, read its brief and report to get the
   title and status (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED`); this is one
   **substate**, key `task-N`, in ledger order.
3. If the sidecar exists, match each entry's verbatim `text` against the
   task briefs and reports to find the task that implemented it, and attach
   it to that substate as a source.
   - Entries you cannot confidently match are **dropped and counted**, never
     reassigned to a plausible-looking task. Report the tally in
     `annotationCoverage` so a bad match rate is visible instead of hidden
     behind a confident-looking colour.
   - **If the sidecar does not exist, publish anyway with no sources.** The
     graph still shows what was built; every container renders as "no
     provenance data", which is the honest answer.
4. Cluster the substates into 2–5 **states**, from scratch, every call.
   This is the one genuinely generative step: each state names what a group
   of tasks accomplished ("address auth in connection"), not what the
   individual tasks were. Clusters are not sticky — an earlier grouping may
   no longer be the best name for it once later tasks add context, and
   that's fine. Substates keep their ledger order inside a state.
5. Call `publish_graph` with the full payload assembled from every
   completed task so far, not only the ones new since the last call — each
   call fully replaces the sheet's prior contents.

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
| "I already asked at the start, no need to re-check sharing.json now" | Re-checked on every `scripts/sdd-publish` call — a mid-plan revoke must take effect on the very next task, not the next plan. |
