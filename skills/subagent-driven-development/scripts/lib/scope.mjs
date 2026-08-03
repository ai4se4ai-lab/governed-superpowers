/**
 * Consent-scope filtering: the single boundary between the full-fidelity local
 * revision and what is allowed to leave the machine.
 *
 * A declined flag means the field is omitted, never blanked - except where the
 * server's schema requires a non-empty string (spec.path, spec.title,
 * states[].label, substates[].title). Those get content-free substitutes
 * instead, chosen to be stable across publishes so the portal's
 * replace-contents-keep-the-tab-name behaviour still works.
 *
 * Two fields have no flag: notes is never sent (free text lifted from task
 * reports, no flag covers it) and commits is always sent (short SHAs carry no
 * content without the repository).
 *
 * `applyScope` never throws and never returns an error: its input is an
 * already-validated, already-written revision, and a malformed `consent.scope`
 * is handled by degrading safely (every flag reads falsy-as-declined). A
 * structurally broken sharing.json is Task 6's problem to catch before calling
 * this, not this function's.
 */
import { createHash } from "node:crypto";

function digestFor(specPath) {
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

  // These entries name the flag that was declined, not necessarily every field
  // it touches - e.g. "substates.title" also covers the state's label/summary.
  // Task 6's FIELD_LABELS map shows these to the human partner, so a label has
  // to describe the whole group the flag governs, not just the literal field.
  if (!scope.substateTitles) omittedFields.push("substates.title");
  if (!scope.changePaths) omittedFields.push("substates.changes");
  if (!scope.annotationText) omittedFields.push("sources.text");
  if (revision.states.some((state) => state.substates.some((substate) => substate.notes))) {
    omittedFields.push("substates.notes");
  }

  const states = revision.states.map((state, index) => {
    const scopedState = {
      key: state.key,
      // substateTitles reaches both container types on purpose: state labels
      // are agent-written prose about spec content, so leaving them while
      // blanking task titles would make the flag toothless.
      label: scope.substateTitles ? state.label : `Group ${index + 1}`,
      substates: state.substates.map((substate) => {
        const scopedSubstate = {
          key: substate.key,
          title: scope.substateTitles ? substate.title : neutralTitle(substate.key),
        };
        if (substate.status != null) scopedSubstate.status = substate.status;
        // changes/commits below are shared references into `revision`, not
        // copies - safe because the caller (Task 6) serializes the payload
        // immediately and neither side is mutated afterward.
        if (scope.changePaths && substate.changes?.length) scopedSubstate.changes = substate.changes;
        if (substate.commits?.length) scopedSubstate.commits = substate.commits;
        if (substate.sources?.length) {
          scopedSubstate.sources = substate.sources.map((source) => {
            const scopedSource = { source: source.source };
            if (source.marker != null) scopedSource.marker = source.marker;
            if (source.ref != null) scopedSource.ref = source.ref;
            if (scope.annotationText && source.text != null) scopedSource.text = source.text;
            return scopedSource;
          });
        }
        return scopedSubstate;
      }),
    };
    if (scope.substateTitles && state.summary) scopedState.summary = state.summary;
    return scopedState;
  });

  // stateEdges/substateEdges/annotationCoverage below are also shared
  // references into `revision`, not copies - same immediate-serialize
  // contract as changes/commits above.
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
