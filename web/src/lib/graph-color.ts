/**
 * Provenance -> colour for the collaboration graph.
 *
 * A state container is washed blue when its work traces back to what the human
 * actually said, red when it rests on the agent's own assumptions, and purple
 * when the two are roughly balanced. The category is computed here at render
 * time rather than stored, because these thresholds are a presentation choice
 * that will get tuned - storing a category column would mean a backfill
 * migration every time we move a number.
 */

export type Mix = {
  human: number;
  ai: number;
  grounded: number;
};

export type ColorCategory = "human" | "ai" | "mixed" | "unknown";

/** Above this share of human-vs-ai, the work reads as human-driven. */
export const HUMAN_THRESHOLD = 0.65;
/** At or below this share, it reads as agent-driven. */
export const AI_THRESHOLD = 0.35;

export const EMPTY_MIX: Mix = { human: 0, ai: 0, grounded: 0 };

/**
 * Only `human` and `ai_assumption` drive the red/blue axis. The other four
 * source types (skill_doc, tool_output, existing_codebase, external_reference)
 * are evidence, not authorship - a requirement grounded in a file says nothing
 * about whether the human or the agent decided it belonged in the spec. They
 * are counted separately and surfaced in the detail drawer instead.
 */
export function categorise(mix: Mix): ColorCategory {
  const decided = mix.human + mix.ai;
  if (decided === 0) return "unknown";

  const humanShare = mix.human / decided;
  if (humanShare >= HUMAN_THRESHOLD) return "human";
  if (humanShare <= AI_THRESHOLD) return "ai";
  return "mixed";
}

type CountedLike = {
  humanCount: number;
  aiCount: number;
  groundedCount: number;
};

/** Sums the denormalised counters carried on each substate row. */
export function mixOf(substates: readonly CountedLike[]): Mix {
  return substates.reduce<Mix>(
    (acc, s) => ({
      human: acc.human + s.humanCount,
      ai: acc.ai + s.aiCount,
      grounded: acc.grounded + s.groundedCount,
    }),
    { ...EMPTY_MIX }
  );
}

export type CategoryTheme = {
  /** Border / text colour. */
  stroke: string;
  /** Container fill. */
  wash: string;
  /** Spelled out, because colour alone must never carry the meaning. */
  label: string;
};

/**
 * CSS custom properties defined in globals.css across all three theme blocks.
 * `unknown` deliberately borrows the neutral ink rather than getting a colour
 * of its own: "we have no provenance data" is an absence, not a fourth kind of
 * collaboration, and rendering it purple would claim a balance we never
 * measured.
 */
const THEMES: Record<ColorCategory, CategoryTheme> = {
  human: { stroke: "var(--prov-human)", wash: "var(--prov-human-wash)", label: "Human-led" },
  ai: { stroke: "var(--prov-ai)", wash: "var(--prov-ai-wash)", label: "AI-led" },
  mixed: { stroke: "var(--prov-mixed)", wash: "var(--prov-mixed-wash)", label: "Balanced" },
  unknown: { stroke: "var(--ink-faint)", wash: "var(--bg-sunken)", label: "No provenance data" },
};

export function themeFor(category: ColorCategory): CategoryTheme {
  return THEMES[category];
}

/**
 * The redundant, non-colour encoding that rides alongside the wash - e.g.
 * "AI 4 · HUMAN 1". Red/purple discrimination fails for common colour-vision
 * deficiencies, and this distinction is the entire point of the view, so the
 * counts are always rendered too.
 */
export function mixCaption(mix: Mix): string {
  if (mix.human + mix.ai + mix.grounded === 0) return "No provenance data";

  const parts: string[] = [];
  if (mix.human > 0) parts.push(`HUMAN ${mix.human}`);
  if (mix.ai > 0) parts.push(`AI ${mix.ai}`);
  if (mix.grounded > 0) parts.push(`GROUNDED ${mix.grounded}`);
  return parts.join(" · ");
}
