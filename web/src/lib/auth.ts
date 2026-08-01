import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { generateOpaqueToken, sha256 } from "./tokens";

const SESSION_COOKIE = "gsp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Issues a session: a random value in an HttpOnly cookie, stored only as a
 * hash. Stealing the database therefore does not yield usable cookies.
 */
export async function createSession(userId: string): Promise<void> {
  const { plaintext, tokenHash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, plaintext, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (value) {
    // deleteMany, not delete: a stale cookie whose row is already gone must
    // not throw on the way out of a logout.
    await prisma.session.deleteMany({ where: { tokenHash: sha256(value) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Invalidates every session for a user - used after an email change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Resolves the signed-in user, or null. Expired rows are deleted on sight so
 * the table self-cleans without a cron job.
 */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(value) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

/**
 * For pages and server actions that require a signed-in user. `redirect`
 * throws, so callers can treat the return value as always present.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export { SESSION_COOKIE };
