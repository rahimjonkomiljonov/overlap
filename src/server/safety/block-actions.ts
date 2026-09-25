"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { blockUserSchema, unblockUserSchema } from "./schema";

export type BlockActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** G2: block = mutual invisibility, one-directional to create (either side can initiate), permanent unless undone. */
export async function blockUser(_prev: BlockActionState, formData: FormData): Promise<BlockActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = blockUserSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };
  if (parsed.data.targetUserId === actor.userId) return { status: "error", code: "CANNOT_BLOCK_SELF" };

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: actor.userId, blockedId: parsed.data.targetUserId } },
    update: {},
    create: { blockerId: actor.userId, blockedId: parsed.data.targetUserId, reason: parsed.data.reason ?? null },
  });

  return { status: "success" };
}

/** "Permanent unless undone" (G2) — this is the undo. */
export async function unblockUser(_prev: BlockActionState, formData: FormData): Promise<BlockActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = unblockUserSchema.safeParse({ targetUserId: formData.get("targetUserId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await prisma.block.deleteMany({ where: { blockerId: actor.userId, blockedId: parsed.data.targetUserId } });
  return { status: "success" };
}
