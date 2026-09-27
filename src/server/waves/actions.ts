"use server";

import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { isBlockedEitherWay } from "./blocks";
import { countWavesSentToday, DAILY_WAVE_CAP, WAVE_ATTEMPT_RATE_LIMIT } from "./cap";
import { formMatch } from "./match";
import { declineWaveSchema, unmatchSchema, waveBackSchema } from "./schema";

export type WaveBackState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/**
 * Waves back at whoever sent `waveId` (the S14 "Waved at you" inbox) — the mutual-wave
 * counterpart to src/server/picks/actions.ts's `sendWave`, for the case where the
 * recipient doesn't have the sender in their own current batch to wave from directly
 * (exposure caps and the diversity mix don't guarantee mutual visibility). Since the
 * incoming wave is already PENDING, this new wave completes the pair immediately.
 */
export async function waveBack(_prev: WaveBackState, formData: FormData): Promise<WaveBackState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  // Shares sendWave's rate-limit budget (S20) — see WAVE_ATTEMPT_RATE_LIMIT's own doc comment.
  const rate = await checkRateLimit(prisma, `wave-attempt:${actor.userId}`, WAVE_ATTEMPT_RATE_LIMIT);
  if (!rate.allowed) {
    return { status: "error", code: "RATE_LIMITED" };
  }

  const parsed = waveBackSchema.safeParse({
    waveId: formData.get("waveId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const incoming = await prisma.wave.findUnique({
    where: { id: parsed.data.waveId },
    select: { id: true, toUserId: true, fromUserId: true, status: true },
  });
  if (!incoming || incoming.toUserId !== actor.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (incoming.status !== "PENDING") {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  if (await isBlockedEitherWay(prisma, actor.userId, incoming.fromUserId)) {
    return { status: "error", code: "BLOCKED" };
  }

  const sentToday = await countWavesSentToday(prisma, actor.userId);
  if (sentToday >= DAILY_WAVE_CAP) {
    return { status: "error", code: "DAILY_CAP_REACHED" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.wave.create({
      data: {
        fromUserId: actor.userId,
        toUserId: incoming.fromUserId,
        targetElement: { type: "profile" },
        note: parsed.data.note ?? null,
        status: "MATCHED",
      },
    });
    await formMatch(tx, actor.userId, incoming.fromUserId, incoming.id);
  });

  return { status: "success" };
}

export type DeclineWaveState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** Dismisses an incoming wave from the inbox without waving back — no match, no cost against the sender's or recipient's cap. */
export async function declineWave(_prev: DeclineWaveState, formData: FormData): Promise<DeclineWaveState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = declineWaveSchema.safeParse({ waveId: formData.get("waveId") });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const incoming = await prisma.wave.findUnique({
    where: { id: parsed.data.waveId },
    select: { id: true, toUserId: true, status: true },
  });
  if (!incoming || incoming.toUserId !== actor.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (incoming.status !== "PENDING") {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  await prisma.wave.update({ where: { id: incoming.id }, data: { status: "DECLINED" } });

  return { status: "success" };
}

export type UnmatchState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

export async function unmatch(_prev: UnmatchState, formData: FormData): Promise<UnmatchState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = unmatchSchema.safeParse({ matchId: formData.get("matchId") });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const match = await prisma.match.findUnique({
    where: { id: parsed.data.matchId },
    select: { id: true, userAId: true, userBId: true, status: true },
  });
  if (!match || (match.userAId !== actor.userId && match.userBId !== actor.userId)) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (match.status !== "ACTIVE") {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  await prisma.match.update({
    where: { id: match.id },
    data: { status: "UNMATCHED", unmatchedAt: new Date(), unmatchedByUserId: actor.userId },
  });

  return { status: "success" };
}
