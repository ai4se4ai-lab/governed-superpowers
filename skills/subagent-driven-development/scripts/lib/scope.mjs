/**
 * Consent-scope filtering: the single boundary between the full-fidelity local
 * revision and what is allowed to leave the machine.
 *
 * A declined flag means the field is omitted, never blanked - except where the
 * server's schema requires a non-empty string (spec.path, spec.title,
 * substates[].title). Those get content-free substitutes instead, chosen to be
 * stable across publishes so the portal's replace-contents-keep-the-tab-name
 * behaviour still works.
 */
import { createHash } from "node:crypto";

export function digestFor(specPath) {
  return createHash("sha256").update(specPath).digest("hex");
}

/** `task-3` -> `Task 3`; anything else -> `Task`, since blank is not allowed. */
function neutralTitle(key) {
  const match = /^task-(\d+)$/.exec(key);
  return match ? `Task ${match[1]}` : "Task";
}

export function applyScope(revision, consent) {
  const scope = consent.scope;
  const omittedFields = [];

  let spec;
  if (scope.specPaths) {
    spec = {
      path: revision.spec.path,
      title: revision.spec.title,
      planPath: revision.spec.planPath ?? null,
    };
  } else {
    const digest = digestFor(revision.spec.path);
    spec = {
      path: `opaque:${digest.slice(0, 16)}`,
      title: `Sheet ${digest.slice(0, 8)}`,
      planPath: null,
    };
    omittedFields.push("spec.path");
  }

  if (!scope.substateTitles) omittedFields.push("substates.title");
  if (!scope.changePaths) omittedFields.push("substates.changes");
  if (!scope.annotationText) omittedFields.push("sources.text");
  if (revision.states.some((state) => state.substates.some((substate) => substate.notes))) {
    omittedFields.push("substates.notes");
  }

  const states = revision.states.map((state, index) => {
    const out = {
      key: state.key,
      label: scope.substateTitles ? state.label : `Group ${index + 1}`,
      substates: state.substates.map((substate) => {
        const sub = {
          key: substate.key,
          title: scope.substateTitles ? substate.title : neutralTitle(substate.key),
        };
        if (substate.status) sub.status = substate.status;
        if (scope.changePaths && substate.changes?.length) sub.changes = substate.changes;
        if (substate.commits?.length) sub.commits = substate.commits;
        if (substate.sources?.length) {
          sub.sources = substate.sources.map((source) => {
            const filtered = { source: source.source };
            if (source.marker != null) filtered.marker = source.marker;
            if (source.ref != null) filtered.ref = source.ref;
            if (scope.annotationText && source.text != null) filtered.text = source.text;
            return filtered;
          });
        }
        return sub;
      }),
    };
    if (scope.substateTitles && state.summary) out.summary = state.summary;
    return out;
  });

  const payload = {
    consent,
    spec,
    states,
    stateEdges: revision.stateEdges ?? [],
    substateEdges: revision.substateEdges ?? [],
  };
  if (revision.annotationCoverage) payload.annotationCoverage = revision.annotationCoverage;

  return { payload, omittedFields };
}
