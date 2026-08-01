"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendEmailChangeEmail } from "@/lib/mail";
import { createVerification } from "@/lib/verification";
import { fieldErrors, profileSchema } from "@/lib/validation";

export type ProfileState = {
  errors?: Record<string, string>;
  message?: string;
  emailPending?: string;
};

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    region: String(formData.get("region") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    country: String(formData.get("country") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { email, ...rest } = parsed.data;
  const emailChanged = email !== user.email;

  // The email column is only written once the new address is confirmed, so a
  // typo can never lock someone out of their own account.
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: rest.username,
        addressLine1: rest.addressLine1 ?? null,
        addressLine2: rest.addressLine2 ?? null,
        city: rest.city ?? null,
        region: rest.region ?? null,
        postalCode: rest.postalCode ?? null,
        country: rest.country ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { errors: { username: "That username is taken" } };
    }
    throw error;
  }

  if (!emailChanged) {
    revalidatePath("/profile");
    return { message: "Profile saved." };
  }

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    revalidatePath("/profile");
    return {
      errors: { email: "That address is already in use" },
      message: "Everything except the email address was saved.",
    };
  }

  const token = await createVerification(user.id, "EMAIL_CHANGE", email);
  try {
    await sendEmailChangeEmail(email, rest.username, token);
  } catch (error) {
    console.error("Failed to send email-change confirmation", error);
    revalidatePath("/profile");
    return {
      errors: { email: "Could not send the confirmation email. The address was not changed." },
      message: "Everything except the email address was saved.",
    };
  }

  revalidatePath("/profile");
  return {
    message: "Profile saved.",
    emailPending: email,
  };
}
