"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { passPickSchema, sendWaveSchema } from "./schema";

export type SendWaveState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/**
 * Sends a wave from one still-actionable pick (S12's "wave composer"). Only ever writes
 * `BatchItem.decision`/`Wave` — reciprocal-wave match detection, the 8/day send cap, and
 * the waves inbox are S14's job ("Waves and matches"), not this action's.
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

  await prisma.$transaction([
    prisma.batchItem.update({ where: { id: item.id }, data: { decision: "WAVED", decidedAt } }),
    prisma.wave.create({
      data: {
        batchItemId: item.id,
        fromUserId: actor.userId,
        toUserId: item.candidateUserId,
        targetElement: parsed.data.targetElement,
        note: parsed.data.note ?? null,
      },
    }),
  ]);

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
