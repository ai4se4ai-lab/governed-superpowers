import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MCP_TOKEN_PREFIX_LENGTH,
  digestsMatch,
  generateMcpToken,
  generateOpaqueToken,
  parseMcpToken,
  sha256,
} from "../src/lib/tokens.js";
import { maskedToken } from "../src/lib/format.js";

test("generated MCP tokens round-trip through parseMcpToken", () => {
  const { plaintext, prefix, tokenHash } = generateMcpToken();

  const parsed = parseMcpToken(plaintext);
  assert.ok(parsed, "a freshly generated token must parse");
  assert.equal(parsed.prefix, prefix);
  assert.equal(sha256(parsed.plaintext), tokenHash);
});

test("generated MCP tokens have the documented shape", () => {
  const { plaintext, prefix } = generateMcpToken();

  assert.match(plaintext, /^gsp_[a-z2-9]{12}_[A-Za-z0-9_-]+$/);
  assert.equal(prefix.length, MCP_TOKEN_PREFIX_LENGTH);
});

test("the plaintext is never recoverable from the stored hash", () => {
  const { plaintext, tokenHash } = generateMcpToken();

  assert.notEqual(tokenHash, plaintext);
  assert.equal(tokenHash.length, 64);
  assert.ok(!tokenHash.includes(plaintext.split("_")[2]));
});

test("two tokens never collide", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const { prefix, plaintext } = generateMcpToken();
    assert.ok(!seen.has(prefix), "prefix collision");
    assert.ok(!seen.has(plaintext), "plaintext collision");
    seen.add(prefix);
    seen.add(plaintext);
  }
});

test("parseMcpToken rejects malformed tokens", () => {
  for (const bad of [
    "",
    "gsp",
    "gsp_short_secret",
    "nope_abcdefghijkm_secret",
    "gsp_abcdefghijkm_",
    "Bearer gsp_abcdefghijkm_secret",
    "gsp_ABCDEFGHIJKM_secret", // prefix is lowercase base32
    "gsp_abcdefghijkm_has spaces",
  ]) {
    assert.equal(parseMcpToken(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("parseMcpToken accepts secrets containing base64url underscores", () => {
  // Regression: the secret half is base64url, so it legitimately contains "_"
  // and "-". Splitting on every underscore rejected ~half of all real tokens.
  const token = "gsp_abcdefghijkm_5OGGxVg6h5ox_KbZrfr4Srsvz-ESlMCTh0NNmK8BXzCQ";

  const parsed = parseMcpToken(token);

  assert.ok(parsed, "a token with underscores in its secret must parse");
  assert.equal(parsed.prefix, "abcdefghijkm");
});

test("every generated token parses, including ones with underscores", () => {
  // generateMcpToken produces base64url secrets; roughly half contain "_" or
  // "-", so a large sample is what makes this a real check.
  let withSeparators = 0;
  for (let i = 0; i < 500; i++) {
    const { plaintext, prefix } = generateMcpToken();
    if (/[_-]/.test(plaintext.slice(17))) withSeparators++;

    const parsed = parseMcpToken(plaintext);
    assert.ok(parsed, `failed to parse ${plaintext}`);
    assert.equal(parsed.prefix, prefix);
  }
  assert.ok(withSeparators > 0, "sample should include secrets with _ or -");
});

test("digestsMatch is true only for identical values", () => {
  assert.equal(digestsMatch("abc", "abc"), true);
  assert.equal(digestsMatch("abc", "abd"), false);
  // Different lengths must return false rather than throwing.
  assert.equal(digestsMatch("abc", "much-longer-value"), false);
});

test("opaque tokens are unique and stored hashed", () => {
  const a = generateOpaqueToken();
  const b = generateOpaqueToken();

  assert.notEqual(a.plaintext, b.plaintext);
  assert.equal(a.tokenHash, sha256(a.plaintext));
  assert.notEqual(a.tokenHash, a.plaintext);
});

test("maskedToken never leaks the secret half", () => {
  const { prefix } = generateMcpToken();
  const masked = maskedToken(prefix);

  assert.ok(masked.startsWith(`gsp_${prefix}_`));
  assert.ok(masked.includes("•"));
});
