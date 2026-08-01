import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTokenSchema,
  fieldErrors,
  normalizeEmail,
  passwordStrength,
  profileSchema,
  signupSchema,
} from "../src/lib/validation.js";

test("emails are normalised to lowercase and trimmed", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");

  const parsed = signupSchema.parse({
    username: "someone",
    email: "Person@Example.COM",
    password: "correct-horse-battery",
  });
  assert.equal(parsed.email, "person@example.com");
});

test("signup rejects short passwords and bad usernames", () => {
  const result = signupSchema.safeParse({
    username: "no spaces allowed",
    email: "person@example.com",
    password: "short",
  });

  assert.equal(result.success, false);
  const errors = fieldErrors(result.error!);
  assert.ok(errors.username);
  assert.ok(errors.password);
});

test("blank optional profile fields become null rather than empty strings", () => {
  const parsed = profileSchema.parse({
    username: "someone",
    email: "person@example.com",
    addressLine1: "  ",
    city: "Montreal",
  });

  assert.equal(parsed.addressLine1, null);
  assert.equal(parsed.city, "Montreal");
});

test("an empty token lifetime means 'never expires'", () => {
  assert.equal(createTokenSchema.parse({ name: "laptop", expiresInDays: "" }).expiresInDays, null);
  assert.equal(createTokenSchema.parse({ name: "laptop", expiresInDays: "90" }).expiresInDays, 90);
  assert.equal(createTokenSchema.safeParse({ name: "laptop", expiresInDays: "-1" }).success, false);
});

test("password strength rises with length and variety", () => {
  assert.equal(passwordStrength(""), 0);
  assert.ok(passwordStrength("abcdefghijkl") < passwordStrength("Abcdefghijkl1!x"));
  assert.equal(passwordStrength("Abcdefghijklmnop1!"), 4);
});
