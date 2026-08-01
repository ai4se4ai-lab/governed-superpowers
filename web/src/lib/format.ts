/**
 * Display helpers safe to import from client components.
 *
 * Deliberately free of node: imports - src/lib/tokens.ts pulls in node:crypto
 * and must never end up in a browser bundle.
 */

/** Renders a token for a list view: `gsp_abc123def456_••••••••`. */
export function maskedToken(prefix: string): string {
  return `gsp_${prefix}_${"•".repeat(8)}`;
}
