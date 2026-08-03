/**
 * Shape validation for an incoming graph document.
 *
 * Deliberately mirrors the constraints in mcp-server/src/tools.ts (min-1
 * states, min-1 substates per state, the source and status enums) so a
 * document that builds locally is one the server would also accept once
 * scope-filtered. Returns the first failure with a JSON-path-ish location
 * rather than throwing, so the CLI can report exactly which field is wrong.
 */

export const PROVENANCE_SOURCES = [
  "human",
  "ai_assumption",
  "skill_doc",
  "tool_output",
  "existing_codebase",
  "external_reference",
];

export const SUBSTATE_STATUSES = ["DONE", "DONE_WITH_CONCERNS", "BLOCKED"];

function fail(path, message) {
  return { ok: false, path, message };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateDocument(doc) {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return fail("", "must be an object");
  }

  const spec = doc.spec;
  if (typeof spec !== "object" || spec === null) return fail("spec", "must be an object");
  if (!isNonEmptyString(spec.path)) return fail("spec.path", "must be a non-empty string");
  if (!isNonEmptyString(spec.title)) return fail("spec.title", "must be a non-empty string");

  if (!Array.isArray(doc.states) || doc.states.length === 0) {
    return fail("states", "must be a non-empty array");
  }

  const stateKeys = new Set();
  for (const [i, state] of doc.states.entries()) {
    const at = `states[${i}]`;
    if (!isNonEmptyString(state.key)) return fail(`${at}.key`, "must be a non-empty string");
    if (stateKeys.has(state.key)) return fail(`${at}.key`, `duplicate state key '${state.key}'`);
    stateKeys.add(state.key);

    if (!isNonEmptyString(state.label)) return fail(`${at}.label`, "must be a non-empty string");
    if (!Array.isArray(state.substates) || state.substates.length === 0) {
      return fail(`${at}.substates`, "must be a non-empty array");
    }

    const substateKeys = new Set();
    for (const [j, substate] of state.substates.entries()) {
      const subAt = `${at}.substates[${j}]`;
      if (!isNonEmptyString(substate.key)) return fail(`${subAt}.key`, "must be a non-empty string");
      if (substateKeys.has(substate.key)) {
        return fail(`${subAt}.key`, `duplicate substate key '${substate.key}'`);
      }
      substateKeys.add(substate.key);

      if (!isNonEmptyString(substate.title)) {
        return fail(`${subAt}.title`, "must be a non-empty string");
      }
      if (
        substate.status !== null &&
        substate.status !== undefined &&
        !SUBSTATE_STATUSES.includes(substate.status)
      ) {
        return fail(`${subAt}.status`, `must be one of ${SUBSTATE_STATUSES.join(", ")}`);
      }

      for (const [k, source] of (substate.sources ?? []).entries()) {
        if (!PROVENANCE_SOURCES.includes(source?.source)) {
          return fail(
            `${subAt}.sources[${k}].source`,
            `must be one of ${PROVENANCE_SOURCES.join(", ")}`
          );
        }
      }
    }
  }

  return { ok: true };
}
