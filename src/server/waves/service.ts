import type { PrismaClient } from "@/generated/prisma/client";
import { isBlockedEitherWay } from "./blocks";
import { countWavesSentToday, DAILY_WAVE_CAP } from "./cap";
import { formMatch } from "./match";

export type WaveBackDb = Pick<PrismaClient, "wave" | "match" | "block" | "conversation" | "notification" | "$transaction">;

export type WaveBackResult =
  | { status: "matched" }
  | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" | "BLOCKED" | "DAILY_CAP_REACHED" };

/**
 * Waves back at whoever sent `waveId` (the "Waved at you" inbox) — the mutual-wave
 * counterpart to `sendWaveStep` (`src/server/picks/service.ts`), for the case where the
 * recipient doesn't have the sender in their own current batch to wave from directly
 * (exposure caps and the diversity mix don't guarantee mutual visibility). Shared by the
 * website's `waveBack` action and the mobile `POST /waves/{id}/wave-back` route. Since
 * the incoming wave is already PENDING, this new wave completes the pair immediately.
 */
export async function waveBackStep(
  db: WaveBackDb,
  person: { userId: string },
  waveId: string,
  note: string | undefined,
): Promise<WaveBackResult> {
  const incoming = await db.wave.findUnique({
    where: { id: waveId },
    select: { id: true, toUserId: true, fromUserId: true, status: true },
  });
  if (!incoming || incoming.toUserId !== person.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (incoming.status !== "PENDING") {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  if (await isBlockedEitherWay(db, person.userId, incoming.fromUserId)) {
    return { status: "error", code: "BLOCKED" };
  }

  const sentToday = await countWavesSentToday(db, person.userId);
  if (sentToday >= DAILY_WAVE_CAP) {
    return { status: "error", code: "DAILY_CAP_REACHED" };
  }

  await db.$transaction(async (tx) => {
    await tx.wave.create({
      data: {
        fromUserId: person.userId,
        toUserId: incoming.fromUserId,
        targetElement: { type: "profile" },
        note: note ?? null,
        status: "MATCHED",
      },
    });
    await formMatch(tx, person.userId, incoming.fromUserId, incoming.id);
  });

  return { status: "matched" };
}

export type UnmatchDb = Pick<PrismaClient, "match">;

export type UnmatchResult = { status: "unmatched" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };

/** Ends an active match for good (no un-unmatch). Shared by the website's `unmatch` action and the mobile `POST /matches/{id}/unmatch` route. */
export async function unmatchStep(db: UnmatchDb, person: { userId: string }, matchId: string): Promise<UnmatchResult> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, userAId: true, userBId: true, status: true },
  });
  if (!match || (match.userAId !== person.userId && match.userBId !== person.userId)) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (match.status !== "ACTIVE") {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  await db.match.update({
    where: { id: match.id },
    data: { status: "UNMATCHED", unmatchedAt: new Date(), unmatchedByUserId: person.userId },
  });

  return { status: "unmatched" };
}

export type DeclineWaveDb = Pick<PrismaClient, "wave">;

export type DeclineWaveResult = { status: "declined" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };

/**
 * Dismisses an incoming wave from the inbox without waving back — no match, no cost
 * against the sender's or recipient's cap. Shared by the website's `declineWave` action
 * and the mobile `POST /waves/{id}/decline` route.
 */
export async function declineWaveStep(
  db: DeclineWaveDb,
  person: { userId: string },
  waveId: string,
): Promise<DeclineWaveResult> {
  const incoming = await db.wave.findUnique({
    where: { id: waveId },
    select: { id: true, toUserId: true, status: true },
  });
  if (!incoming || incoming.toUserId !== person.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (incoming.status !== "PENDING") {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  await db.wave.update({ where: { id: incoming.id }, data: { status: "DECLINED" } });

  return { status: "declined" };
}
