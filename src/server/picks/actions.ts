"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isBlockedEitherWay } from "@/server/waves/blocks";
import { countWavesSentToday, DAILY_WAVE_CAP } from "@/server/waves/cap";
import { formMatch } from "@/server/waves/match";
import { enqueueNotification } from "@/server/notifications/queue";
import { passPickSchema, sendWaveSchema } from "./schema";

export type SendWaveState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/**
 * Sends a wave from one still-actionable pick (S12's "wave composer"). Checks the 8/day
 * cap and blocks (S14), and completes a match immediately if the target already waved at
 * the actor first (`src/server/waves/match.ts`'s `formMatch`) — the inbox's `waveBack`
 * (`src/server/waves/actions.ts`) is the mirror image of this for the other direction.
 */
export async function sendWave(_prev: SendWaveState, formData: FormData): Promise<SendWaveState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const targetType = formData.get("targetType");
  const targetElement =
    targetType === "photo"
      ? { type: "photo" as const, photoId: formData.get("photoId") }
      : targetType === "promptAnswer"
        ? { type: "promptAnswer" as const, promptAnswerId: formData.get("promptAnswerId") }
        : { type: "profile" as const };

  const parsed = sendWaveSchema.safeParse({
    batchItemId: formData.get("batchItemId"),
    targetElement,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const item = await prisma.batchItem.findUnique({
    where: { id: parsed.data.batchItemId },
    select: { id: true, decision: true, candidateUserId: true, dailyBatch: { select: { userId: true } } },
  });
  if (!item || item.dailyBatch.userId !== actor.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (item.decision !== null) {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  const decidedAt = new Date();

  // The same person can appear as a candidate in more than one of today's intent
  // batches — waving is a person-level action (Wave.fromUserId/toUserId is unique), so
  // a second wave at someone already waved at just marks this pick decided too, rather
  // than erroring or creating a duplicate Wave row.
  const existingWave = await prisma.wave.findUnique({
    where: { fromUserId_toUserId: { fromUserId: actor.userId, toUserId: item.candidateUserId } },
    select: { id: true },
  });

  if (existingWave) {
    await prisma.batchItem.update({ where: { id: item.id }, data: { decision: "WAVED", decidedAt } });
    return { status: "success" };
  }

  if (await isBlockedEitherWay(prisma, actor.userId, item.candidateUserId)) {
    return { status: "error", code: "BLOCKED" };
  }

  const sentToday = await countWavesSentToday(prisma, actor.userId);
  if (sentToday >= DAILY_WAVE_CAP) {
    return { status: "error", code: "DAILY_CAP_REACHED" };
  }

  // The candidate may already have waved at the actor first (from their own picks, or
  // the S14 waves inbox) — if so, this wave completes the pair into a match right away
  // instead of sitting PENDING until some future reciprocal action.
  const reverseWave = await prisma.wave.findUnique({
    where: { fromUserId_toUserId: { fromUserId: item.candidateUserId, toUserId: actor.userId } },
    select: { id: true, status: true },
  });
  const mutual = reverseWave?.status === "PENDING";

  await prisma.$transaction(async (tx) => {
    await tx.batchItem.update({ where: { id: item.id }, data: { decision: "WAVED", decidedAt } });
    const wave = await tx.wave.create({
      data: {
        batchItemId: item.id,
        fromUserId: actor.userId,
        toUserId: item.candidateUserId,
        targetElement: parsed.data.targetElement,
        note: parsed.data.note ?? null,
        status: mutual ? "MATCHED" : "PENDING",
      },
    });
    if (mutual && reverseWave) {
      await formMatch(tx, actor.userId, item.candidateUserId, reverseWave.id);
    } else {
      // A mutual wave forms a match instead (handled by formMatch above), which queues
      // its own MATCH notification — WAVE_RECEIVED only ever fires for a wave still
      // sitting PENDING.
      await enqueueNotification(tx, {
        userId: item.candidateUserId,
        type: "WAVE_RECEIVED",
        dedupeKey: `wave-received:${wave.id}`,
      });
    }
  });

  return { status: "success" };
}

export type PassPickState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

export async function passPick(_prev: PassPickState, formData: FormData): Promise<PassPickState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = passPickSchema.safeParse({ batchItemId: formData.get("batchItemId") });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const item = await prisma.batchItem.findUnique({
    where: { id: parsed.data.batchItemId },
    select: { id: true, decision: true, dailyBatch: { select: { userId: true } } },
  });
  if (!item || item.dailyBatch.userId !== actor.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (item.decision !== null) {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  await prisma.batchItem.update({ where: { id: item.id }, data: { decision: "PASSED", decidedAt: new Date() } });

  return { status: "success" };
}
