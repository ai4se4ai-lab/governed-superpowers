import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { createPool, createTokenVerifier } from "../src/db.js";

/**
 * Integration coverage for the real SQL. Skipped unless TEST_DATABASE_URL
 * points at a database with the portal's schema applied, so `npm test` stays
 * green with no Postgres running:
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
 *   (cd web && npx prisma migrate deploy)
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const skip = TEST_DATABASE_URL ? false : "TEST_DATABASE_URL is not set";

let pool: pg.Pool;
let userId: string;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function mintToken() {
  const prefix = randomBytes(6).toString("hex"); // 12 chars, matches PREFIX_LENGTH
  const plaintext = `gsp_${prefix}_${randomBytes(24).toString("base64url")}`;
  return { prefix, plaintext, tokenHash: sha256Hex(plaintext) };
}

async function insertToken(opts: { revokedAt?: Date | null; expiresAt?: Date | null } = {}) {
  const token = mintToken();
  await pool.query(
    `INSERT INTO "McpToken" (id, name, prefix, "tokenHash", "userId", "expiresAt", "revokedAt")
     VALUES (gen_random_uuid(), 'test', $1, $2, $3, $4, $5)`,
    [token.prefix, token.tokenHash, userId, opts.expiresAt ?? null, opts.revokedAt ?? null],
  );
  return token;
}

before(async () => {
  if (skip) return;
  pool = createPool(TEST_DATABASE_URL!);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "User" (id, email, username, "passwordHash", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'x', NOW())
     RETURNING id`,
    [`db-test-${randomBytes(6).toString("hex")}@example.com`, `db-test-${randomBytes(6).toString("hex")}`],
  );
  userId = rows[0].id;
});

after(async () => {
  if (skip) return;
  // Tokens cascade with the user.
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  await pool.end();
});

test("accepts a live token and returns its owner", { skip }, async () => {
  const verify = createTokenVerifier(pool);
  const token = await insertToken();

  const result = await verify(token.plaintext);

  assert.ok(result, "a live token must verify");
  assert.equal(result.userId, userId);
});

test("rejects a revoked token", { skip }, async () => {
  const verify = createTokenVerifier(pool);
  const token = await insertToken({ revokedAt: new Date() });

  assert.equal(await verify(token.plaintext), null);
});

test("rejects an expired token", { skip }, async () => {
  const verify = createTokenVerifier(pool);
  const token = await insertToken({ expiresAt: new Date(Date.now() - 60_000) });

  assert.equal(await verify(token.plaintext), null);
});

test("rejects a token whose secret half is wrong", { skip }, async () => {
  const verify = createTokenVerifier(pool);
  const token = await insertToken();

  // Same prefix, different secret - the prefix lookup hits but the hash must not.
  assert.equal(await verify(`gsp_${token.prefix}_not-the-real-secret`), null);
});

test("rejects malformed tokens without querying", { skip }, async () => {
  const verify = createTokenVerifier(pool);

  for (const bad of ["", "nonsense", "gsp_tooshort_x", "gsp_abcdefghijkm_"]) {
    assert.equal(await verify(bad), null);
  }
});

test("records lastUsedAt after a successful verification", { skip }, async () => {
  const verify = createTokenVerifier(pool);
  const token = await insertToken();

  await verify(token.plaintext);

  // The write is deliberately not awaited by the verifier, so poll briefly.
  let lastUsedAt: Date | null = null;
  for (let attempt = 0; attempt < 20 && lastUsedAt === null; attempt++) {
    await new Promise((r) => setTimeout(r, 50));
    const { rows } = await pool.query<{ lastUsedAt: Date | null }>(
      `SELECT "lastUsedAt" FROM "McpToken" WHERE prefix = $1`,
      [token.prefix],
    );
    lastUsedAt = rows[0]?.lastUsedAt ?? null;
  }

  assert.ok(lastUsedAt, "lastUsedAt should be recorded after use");
});
