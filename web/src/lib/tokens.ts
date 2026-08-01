import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure crypto helpers for the two kinds of opaque secret this app hands out:
 * MCP tokens and session/verification tokens. No database or framework
 * imports live here so the module can be unit-tested directly with node:test.
 */

export const MCP_TOKEN_PREFIX_LENGTH = 12;

/** Lowercase base32-ish alphabet: no 0/1/l/o, so prefixes are easy to read aloud. */
const PREFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Both sides are re-hashed so
 * timingSafeEqual (which throws on length mismatch) never sees attacker-
 * controlled lengths.
 */
export function digestsMatch(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a, "utf8").digest(),
    createHash("sha256").update(b, "utf8").digest(),
  );
}

function randomPrefix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) {
    out += PREFIX_ALPHABET[byte % PREFIX_ALPHABET.length];
  }
  return out;
}

export type GeneratedMcpToken = {
  /** Shown to the user exactly once. Never persisted. */
  plaintext: string;
  /** Public, indexed lookup key stored in McpToken.prefix. */
  prefix: string;
  /** sha256 of `plaintext`, stored in McpToken.tokenHash. */
  tokenHash: string;
};

/**
 * Mints an MCP token of the form `gsp_<prefix>_<secret>`.
 *
 * The prefix is stored in the clear and indexed so mcp-server can find the
 * row with one lookup; the secret half is only ever kept as a hash. Both
 * halves must match for a token to authenticate.
 */
export function generateMcpToken(): GeneratedMcpToken {
  const prefix = randomPrefix(MCP_TOKEN_PREFIX_LENGTH);
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `gsp_${prefix}_${secret}`;
  return { plaintext, prefix, tokenHash: sha256(plaintext) };
}

/**
 * Matches `gsp_<12 chars>_<secret>`.
 *
 * Anchored on the first two separators only: the secret is base64url, whose
 * alphabet includes "_", so splitting on every underscore would reject most
 * valid tokens.
 */
const MCP_TOKEN_PATTERN = new RegExp(
  `^gsp_([a-z0-9]{${MCP_TOKEN_PREFIX_LENGTH}})_([A-Za-z0-9_-]+)$`,
);

/**
 * Splits a presented token back into its parts. Returns null for anything
 * that isn't shaped like one of ours, so callers can 401 without a DB hit.
 * Mirrors parseToken() in mcp-server/src/db.ts - keep the two in sync.
 */
export function parseMcpToken(token: string): { prefix: string; plaintext: string } | null {
  const match = token.match(MCP_TOKEN_PATTERN);
  if (!match) return null;
  return { prefix: match[1], plaintext: token };
}

/** Opaque high-entropy value for session cookies and emailed links. */
export function generateOpaqueToken(): { plaintext: string; tokenHash: string } {
  const plaintext = randomBytes(32).toString("base64url");
  return { plaintext, tokenHash: sha256(plaintext) };
}
