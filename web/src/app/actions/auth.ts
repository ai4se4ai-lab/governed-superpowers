"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { sendConfirmationEmail } from "@/lib/mail";
import { createVerification } from "@/lib/verification";
import { fieldErrors, loginSchema, signupSchema } from "@/lib/validation";

export type FormState = { errors?: Record<string, string>; ok?: boolean };

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { username, email, password } = parsed.data;

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { username, email, passwordHash: await hashPassword(password) },
    });
    userId = user.id;
  } catch (error) {
    // P2002 = unique constraint. Report which field so the user can fix it;
    // email enumeration is already possible via login, and a vague error here
    // would just make signup unusable.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined)?.join(",") ?? "";
      return {
        errors: target.includes("username")
          ? { username: "That username is taken" }
          : { email: "An account already exists for that address" },
      };
    }
    throw error;
  }

  const token = await createVerification(userId, "EMAIL_CONFIRM");
  try {
    await sendConfirmationEmail(email, username, token);
  } catch (error) {
    console.error("Failed to send confirmation email", error);
    return {
      errors: {
        _form: "Your account was created but the confirmation email could not be sent. Use “Resend” on the next screen once mail is configured.",
      },
    };
  }

  redirect(`/check-email?to=${encodeURIComponent(email)}`);
}

export async function resendConfirmationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always report success: this endpoint is unauthenticated, so a truthful
  // "no such account" would turn it into an address oracle.
  if (user && !user.emailVerifiedAt) {
    const token = await createVerification(user.id, "EMAIL_CONFIRM");
    try {
      await sendConfirmationEmail(user.email, user.username, token);
    } catch (error) {
      console.error("Failed to resend confirmation email", error);
    }
  }

  return { ok: true };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Hash against a dummy value when the user is missing so a wrong address and
  // a wrong password take the same time.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const passwordOk = await verifyPassword(parsed.data.password, hash);

  if (!user || !passwordOk) {
    return { errors: { _form: "Email or password is incorrect" } };
  }

  if (!user.emailVerifiedAt) {
    return {
      errors: {
        _form: "Confirm your email address first — check your inbox for the invitation link.",
      },
    };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
