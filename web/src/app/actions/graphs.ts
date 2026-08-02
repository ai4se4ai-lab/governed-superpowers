"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteSpecSchema, renameSpecSchema } from "@/lib/validation";

export type SheetState = { error?: string; specId?: string; title?: string };

/**
 * Renames a sheet tab.
 *
 * GraphSpec has no userId of its own, so ownership is enforced through the
 * project relation - same idea as the `where: { id, userId }` scoping on
 * tokens. A count of 0 means the row either doesn't exist or belongs to
 * somebody else, and both answer the same way: nothing changed.
 *
 * Note the MCP publish path deliberately never overwrites this field, so a
 * rename survives every subsequent publish of the same spec.
 */
export async function renameSpecAction(
  _prev: SheetState,
  formData: FormData,
): Promise<SheetState> {
  const user = await requireUser();

  const parsed = renameSpecSchema.safeParse({
    specId: String(formData.get("specId") ?? ""),
    title: String(formData.get("title") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That sheet no longer exists." };
  }

  const result = await prisma.graphSpec.updateMany({
    where: { id: parsed.data.specId, project: { userId: user.id } },
    data: { title: parsed.data.title },
  });

  if (result.count === 0) return { error: "That sheet no longer exists." };

  revalidatePath("/graphs");
  return { specId: parsed.data.specId, title: parsed.data.title };
}

/**
 * Deletes one sheet and everything under it. The cascade takes out states,
 * substates, sources and both edge tables; the project row stays, so other
 * specs published from the same repo are untouched.
 */
export async function deleteSpecAction(
  _prev: SheetState,
  formData: FormData,
): Promise<SheetState> {
  const user = await requireUser();

  const parsed = deleteSpecSchema.safeParse({ specId: String(formData.get("specId") ?? "") });
  if (!parsed.success) return { error: "That sheet no longer exists." };

  const result = await prisma.graphSpec.deleteMany({
    where: { id: parsed.data.specId, project: { userId: user.id } },
  });

  if (result.count === 0) return { error: "That sheet no longer exists." };

  revalidatePath("/graphs");
  return { specId: parsed.data.specId };
}
