import { z } from "zod";

/**
 * Emails are stored lowercased so the unique index doubles as
 * case-insensitive matching. Every read and write path must funnel through
 * this - do not call prisma.user.findUnique({ email }) with raw input.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const email = z
  .string()
  .min(1, "Email is required")
  .email("That doesn't look like an email address")
  .transform(normalizeEmail);

const username = z
  .string()
  .min(3, "At least 3 characters")
  .max(32, "At most 32 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, hyphen and underscore only");

const password = z
  .string()
  .min(12, "At least 12 characters")
  .max(200, "At most 200 characters");

export const signupSchema = z.object({
  username,
  email,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `At most ${max} characters`)
    .transform((v) => v.trim())
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

export const profileSchema = z.object({
  username,
  email,
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(80),
});

export const createTokenSchema = z.object({
  name: z
    .string()
    .min(1, "Give the token a name so you can recognise it later")
    .max(60, "At most 60 characters")
    .transform((v) => v.trim()),
  // "" means "never expires" - the <select> submits a string.
  expiresInDays: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 3650), {
      message: "Pick one of the offered lifetimes",
    }),
});

export const revokeTokenSchema = z.object({
  tokenId: z.string().uuid(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

/** Rough strength signal for the signup meter. Not a security control. */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 | 4 {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 12) score++;
  if (value.length >= 16) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^a-zA-Z0-9]/.test(value)) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}

/**
 * Flattens a ZodError into { field: message } for rendering next to inputs.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
