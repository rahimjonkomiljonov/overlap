"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { blockUserSchema, unblockUserSchema } from "./schema";
import { blockUserStep, unblockUserStep } from "./service";

export type BlockActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** G2: block = mutual invisibility, one-directional to create (either side can initiate), permanent unless undone. Rules in `blockUserStep`, shared with the mobile route. */
export async function blockUser(_prev: BlockActionState, formData: FormData): Promise<BlockActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = blockUserSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await blockUserStep(prisma, { userId: actor.userId }, parsed.data);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

/** "Permanent unless undone" (G2) — this is the undo. */
export async function unblockUser(_prev: BlockActionState, formData: FormData): Promise<BlockActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = unblockUserSchema.safeParse({ targetUserId: formData.get("targetUserId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await unblockUserStep(prisma, { userId: actor.userId }, parsed.data.targetUserId);
  return { status: "success" };
}
