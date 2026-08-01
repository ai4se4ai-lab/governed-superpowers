"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { generateMcpToken } from "@/lib/tokens";
import { createTokenSchema, fieldErrors, revokeTokenSchema } from "@/lib/validation";

export type CreateTokenState = {
  errors?: Record<string, string>;
  /** Returned exactly once, straight after minting. Never read back from the DB. */
  plaintext?: string;
  name?: string;
};

export async function createTokenAction(
  _prev: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const user = await requireUser();

  const parsed = createTokenSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    expiresInDays: String(formData.get("expiresInDays") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { name, expiresInDays } = parsed.data;
  const { plaintext, prefix, tokenHash } = generateMcpToken();

  await prisma.mcpToken.create({
    data: {
      userId: user.id,
      name,
      prefix,
      tokenHash,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
    },
  });

  revalidatePath("/tokens");
  return { plaintext, name };
}

export type RevokeState = { error?: string; revokedId?: string };

export async function revokeTokenAction(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const user = await requireUser();

  const parsed = revokeTokenSchema.safeParse({ tokenId: String(formData.get("tokenId") ?? "") });
  if (!parsed.success) return { error: "That token no longer exists." };

  // Scoping the update by userId is what stops one account revoking another's
  // token by guessing an id.
  const result = await prisma.mcpToken.updateMany({
    where: { id: parsed.data.tokenId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) return { error: "That token was already revoked." };

  revalidatePath("/tokens");
  return { revokedId: parsed.data.tokenId };
}

export async function deleteTokenAction(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const user = await requireUser();

  const parsed = revokeTokenSchema.safeParse({ tokenId: String(formData.get("tokenId") ?? "") });
  if (!parsed.success) return { error: "That token no longer exists." };

  await prisma.mcpToken.deleteMany({ where: { id: parsed.data.tokenId, userId: user.id } });

  revalidatePath("/tokens");
  return { revokedId: parsed.data.tokenId };
}
