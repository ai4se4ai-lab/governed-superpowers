import "server-only";

import type { VerificationPurpose } from "@prisma/client";
import { prisma } from "./db";
import { generateOpaqueToken, sha256 } from "./tokens";

/** How long each kind of emailed link stays valid. */
const TTL_MS: Record<VerificationPurpose, number> = {
  EMAIL_CONFIRM: 24 * 60 * 60 * 1000, // 24h - people sign up and wander off
  EMAIL_CHANGE: 60 * 60 * 1000, // 1h - higher-risk, shorter window
  PASSWORD_RESET: 60 * 60 * 1000,
};

/**
 * Creates a single-use verification token and returns the plaintext to embed
 * in an email link. Any outstanding token of the same purpose is consumed
 * first, so re-requesting a link invalidates the previous one.
 */
export async function createVerification(
  userId: string,
  purpose: VerificationPurpose,
  newEmail?: string,
): Promise<string> {
  const { plaintext, tokenHash } = generateOpaqueToken();

  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: {
        userId,
        purpose,
        tokenHash,
        newEmail: newEmail ?? null,
        expiresAt: new Date(Date.now() + TTL_MS[purpose]),
      },
    }),
  ]);

  return plaintext;
}

export type ConsumeResult =
  | { ok: true; userId: string; purpose: VerificationPurpose; newEmail: string | null }
  | { ok: false; reason: "unknown" | "used" | "expired" };

/**
 * Atomically marks a token consumed. The updateMany guard on `consumedAt:
 * null` means a double-click on the email link can only ever succeed once,
 * even if both requests arrive together.
 */
export async function consumeVerification(plaintext: string): Promise<ConsumeResult> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: sha256(plaintext) },
  });

  if (!record) return { ok: false, reason: "unknown" };
  if (record.consumedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const claimed = await prisma.verificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "used" };

  return {
    ok: true,
    userId: record.userId,
    purpose: record.purpose,
    newEmail: record.newEmail,
  };
}
