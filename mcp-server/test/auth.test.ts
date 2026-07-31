import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireBearerToken } from "../src/auth.js";

const TOKEN = "correct-horse-battery-staple";

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

test("rejects a request with no Authorization header", () => {
  const middleware = requireBearerToken(TOKEN);
  const { res, calls } = fakeResponse();
  let nextCalled = false;

  middleware(fakeRequest(undefined), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("rejects a request with the wrong token", () => {
  const middleware = requireBearerToken(TOKEN);
  const { res, calls } = fakeResponse();
  let nextCalled = false;

  middleware(fakeRequest("Bearer wrong-token"), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("rejects a non-Bearer scheme", () => {
  const middleware = requireBearerToken(TOKEN);
  const { res, calls } = fakeResponse();
  let nextCalled = false;

  middleware(fakeRequest(`Basic ${TOKEN}`), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(calls.status, 401);
});

test("accepts a request with the correct bearer token", () => {
  const middleware = requireBearerToken(TOKEN);
  const { res } = fakeResponse();
  let nextCalled = false;

  middleware(fakeRequest(`Bearer ${TOKEN}`), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
