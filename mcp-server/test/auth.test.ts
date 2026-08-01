import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireMcpToken, type AuthedRequest, type TokenVerifier } from "../src/auth.js";

const VALID = "gsp_abcdefghijkm_s3cret-value";

/**
 * Stands in for the Postgres-backed verifier in src/db.ts. The middleware
 * takes the verifier as a parameter precisely so these tests need no database.
 * The SQL itself is covered by test/db.test.ts, which is skipped unless
 * TEST_DATABASE_URL is set.
 */
const verifier: TokenVerifier = async (token) =>
  token === VALID ? { userId: "user-1", tokenId: "token-1" } : null;

function fakeRequest(authorization?: string): Request {
  return {
    header: (name: string) => (name.toLowerCase() === "authorization" ? authorization : undefined),
  } as unknown as Request;
}

function fakeResponse() {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, calls };
}

async function run(authorization: string | undefined, verify: TokenVerifier = verifier) {
  const req = fakeRequest(authorization);
  const { res, calls } = fakeResponse();
  let nextCalled = false;

  await requireMcpToken(verify)(req, res, () => {
    nextCalled = true;
  });

  return { req: req as AuthedRequest, calls, nextCalled };
}

test("rejects a request with no Authorization header", async () => {
  const { calls, nextCalled } = await run(undefined);

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("rejects a token the verifier does not recognise", async () => {
  const { calls, nextCalled } = await run("Bearer gsp_abcdefghijkm_wrong");

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("rejects a non-Bearer scheme", async () => {
  const { calls, nextCalled } = await run(`Basic ${VALID}`);

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("accepts a token the verifier recognises", async () => {
  const { nextCalled } = await run(`Bearer ${VALID}`);

  assert.equal(nextCalled, true);
});

test("attaches the resolved identity to the request", async () => {
  const { req } = await run(`Bearer ${VALID}`);

  assert.deepEqual(req.auth, { userId: "user-1", tokenId: "token-1" });
});

test("rejects a revoked token", async () => {
  // Revocation is expressed by the verifier returning null - the middleware
  // does not need to know why.
  const revoked: TokenVerifier = async () => null;
  const { calls, nextCalled } = await run(`Bearer ${VALID}`, revoked);

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("rejects an expired token", async () => {
  const expired: TokenVerifier = async () => null;
  const { calls, nextCalled } = await run(`Bearer ${VALID}`, expired);

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("keeps the JSON-RPC error shape clients already handle", async () => {
  const { calls } = await run(undefined);

  assert.deepEqual(calls.body, {
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
    id: null,
  });
});

test("reports 503, not 401, when the database is unreachable", async () => {
  const broken: TokenVerifier = async () => {
    throw new Error("ECONNREFUSED");
  };
  const { calls, nextCalled } = await run(`Bearer ${VALID}`, broken);

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 503);
});
