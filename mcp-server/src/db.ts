import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import type { TokenVerifier, VerifiedToken } from "./auth.js";

/**
 * Token verification against the account portal's Postgres database.
 *
 * This module deliberately does NOT use Prisma. It needs exactly two
 * statements, and pulling in a generated client would couple this container's
 * build to web/prisma/schema.prisma. The table and column names below are the
 * contract - if you rename them in that schema, change them here too.
 */

const PREFIX_LENGTH = 12;

/**
 * Matches `gsp_<12 chars>_<secret>`.
 *
 * Anchored on the first two separators only: the secret is base64url, whose
 * alphabet includes "_", so splitting on every underscore would reject most
 * valid tokens.
 */
const TOKEN_PATTERN = new RegExp(`^gsp_([a-z0-9]{${PREFIX_LENGTH}})_([A-Za-z0-9_-]+)$`);

/** Mirrors parseMcpToken() in web/src/lib/tokens.ts - keep the two in sync. */
function parseToken(token: string): { prefix: string } | null {
  const match = token.match(TOKEN_PATTERN);
  return match ? { prefix: match[1] } : null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests of equal expected length. */
function digestsMatch(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a, "utf8").digest(),
    createHash("sha256").update(b, "utf8").digest(),
  );
}

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

type TokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
};

/** Don't write lastUsedAt more than once a minute per token. */
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Builds the verifier the auth middleware calls on every request.
 *
 * Lookup is by the token's public prefix, which is uniquely indexed, so this
 * is one index hit rather than a scan-and-hash over every row. The secret half
 * is then checked against the stored hash in constant time.
 */
export function createTokenVerifier(pool: pg.Pool): TokenVerifier {
  return async function verify(token: string): Promise<VerifiedToken | null> {
    const parsed = parseToken(token);
    // Malformed tokens are rejected without touching the database, so garbage
    // traffic can't be used to load it.
    if (!parsed) return null;

    const { rows } = await pool.query<TokenRow>(
      `SELECT id, "userId", "tokenHash", "revokedAt", "expiresAt", "lastUsedAt"
         FROM "McpToken"
        WHERE prefix = $1
        LIMIT 1`,
      [parsed.prefix],
    );

    const row = rows[0];
    if (!row) return null;
    if (!digestsMatch(sha256Hex(token), row.tokenHash)) return null;
    if (row.revokedAt !== null) return null;
    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) return null;

    touchLastUsed(pool, row);

    return { userId: row.userId, tokenId: row.id };
  };
}

/**
 * Records usage without blocking the request. A failure here must never turn
 * a valid request into a 500, so it is logged and swallowed.
 */
function touchLastUsed(pool: pg.Pool, row: TokenRow): void {
  const last = row.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - last < LAST_USED_THROTTLE_MS) return;

  void pool
    .query(`UPDATE "McpToken" SET "lastUsedAt" = NOW() WHERE id = $1`, [row.id])
    .catch((error: unknown) => {
      console.error("Failed to record token usage", error);
    });
}
