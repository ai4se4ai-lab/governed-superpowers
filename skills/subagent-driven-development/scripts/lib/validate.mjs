/**
 * Shape validation for an incoming graph document.
 *
 * Deliberately mirrors the *shape* constraints in mcp-server/src/tools.ts
 * (min-1 states, min-1 substates per state, the source and status enums).
 * It does not duplicate the server's size bounds (states max 20, substates
 * max 50, sources max 200, and various string maxima) — an over-large
 * document can still pass here and be rejected server-side.
 *
 * The duplicate key checks (state keys globally, substate keys within a
 * state) are a local addition with no server counterpart: the viewer
 * synthesises node ids as `state-<key>` and `sub-<stateKey>-<key>`, so
 * duplicates would collide and silently drop nodes from the canvas.
 *
 * Returns the first failure as a value rather than throwing, so the CLI can
 * report exactly which field is wrong before it touches the filesystem.
 * `path` is `""` for a root-level failure. Unlike store.mjs, which throws — a
 * missing repo or a corrupt index is an environment failure with no field to
 * blame — a malformed document here is expected input, so it is reported as a
 * value.
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

function isObject(value) {
  return typeof value === "object" && value !== null;
}

/**
 * Validates one substate, returning a failure or null.
 *
 * `seenKeys` is the caller's per-state set, passed in rather than held as
 * module state: substate keys must be unique *within* a state but may repeat
 * across states, which is what the `sub-<stateKey>-<key>` id scheme requires.
 */
function validateSubstate(substate, at, seenKeys) {
  if (!isObject(substate)) return fail(at, "must be an object");
  if (!isNonEmptyString(substate.key)) return fail(`${at}.key`, "must be a non-empty string");
  if (seenKeys.has(substate.key)) {
    return fail(`${at}.key`, `duplicate substate key '${substate.key}'`);
  }
  seenKeys.add(substate.key);

  if (!isNonEmptyString(substate.title)) {
    return fail(`${at}.title`, "must be a non-empty string");
  }

  const { status, sources } = substate;
  if (status !== undefined && status !== null && !SUBSTATE_STATUSES.includes(status)) {
    return fail(`${at}.status`, `must be one of ${SUBSTATE_STATUSES.join(", ")}`);
  }

  if (sources !== undefined && sources !== null && !Array.isArray(sources)) {
    return fail(`${at}.sources`, "must be an array");
  }

  for (const [k, source] of (sources ?? []).entries()) {
    if (!PROVENANCE_SOURCES.includes(source?.source)) {
      return fail(`${at}.sources[${k}].source`, `must be one of ${PROVENANCE_SOURCES.join(", ")}`);
    }
  }

  return null;
}

export function validateDocument(doc) {
  if (!isObject(doc) || Array.isArray(doc)) return fail("", "must be an object");

  const spec = doc.spec;
  if (!isObject(spec)) return fail("spec", "must be an object");
  if (!isNonEmptyString(spec.path)) return fail("spec.path", "must be a non-empty string");
  if (!isNonEmptyString(spec.title)) return fail("spec.title", "must be a non-empty string");

  if (!Array.isArray(doc.states) || doc.states.length === 0) {
    return fail("states", "must be a non-empty array");
  }

  const stateKeys = new Set();
  for (const [i, state] of doc.states.entries()) {
    const at = `states[${i}]`;
    if (!isObject(state)) return fail(at, "must be an object");
    if (!isNonEmptyString(state.key)) return fail(`${at}.key`, "must be a non-empty string");
    if (stateKeys.has(state.key)) return fail(`${at}.key`, `duplicate state key '${state.key}'`);
    stateKeys.add(state.key);

    if (!isNonEmptyString(state.label)) return fail(`${at}.label`, "must be a non-empty string");
    if (!Array.isArray(state.substates) || state.substates.length === 0) {
      return fail(`${at}.substates`, "must be a non-empty array");
    }

    // Scoped per state, not hoisted: the same substate key under two different
    // states is legal and common.
    const substateKeys = new Set();
    for (const [j, substate] of state.substates.entries()) {
      const failure = validateSubstate(substate, `${at}.substates[${j}]`, substateKeys);
      if (failure) return failure;
    }
  }

  return { ok: true };
}
