/**
 * Denormalised provenance counters, computed once at write time.
 *
 * The rule is the portal's, in web/src/lib/graph-color.ts: `human` and
 * `ai_assumption` are the only two sources that say who *decided* a
 * requirement belonged in the spec, so only they feed the red/blue axis. The
 * other four (skill_doc, tool_output, existing_codebase, external_reference)
 * are evidence rather than authorship — a requirement grounded in a file says
 * nothing about who chose to put it in the spec — so they are counted
 * separately. Precomputing here means the viewer never has to know the
 * taxonomy, and the colour thresholds stay a presentation choice the portal
 * can retune without a migration.
 *
 * Anything that is not `human` or `ai_assumption` counts as grounded. That is
 * deliberate rather than an enum lookup: validate.mjs has already rejected
 * any source outside the six, so a defaulting branch here would be dead code.
 */

export function countsForSources(sources = []) {
  let humanCount = 0;
  let aiCount = 0;
  let groundedCount = 0;

  for (const source of sources) {
    if (source.source === "human") humanCount += 1;
    else if (source.source === "ai_assumption") aiCount += 1;
    else groundedCount += 1;
  }

  return { humanCount, aiCount, groundedCount };
}

/**
 * Returns a copy of the document with counts stamped on every substate.
 *
 * Copies rather than mutates: the caller still holds the document it
 * assembled, and a half-stamped document on an error path would be worse than
 * none. The copy is shallow per level, which is enough — no field below a
 * substate is modified.
 */
export function withCounts(doc) {
  return {
    ...doc,
    states: doc.states.map((state) => ({
      ...state,
      substates: state.substates.map((substate) => ({
        ...substate,
        ...countsForSources(substate.sources ?? []),
      })),
    })),
  };
}
