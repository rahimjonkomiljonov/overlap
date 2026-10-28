import type { PrismaClient } from "@/generated/prisma/client";
import { enqueueNotification } from "@/server/notifications/queue";
import { isBlockedEitherWay } from "@/server/waves/blocks";
import { countWavesSentToday, DAILY_WAVE_CAP } from "@/server/waves/cap";
import { formMatch } from "@/server/waves/match";
import type { TargetElement } from "./schema";

export type PassPickDb = Pick<PrismaClient, "batchItem">;

export type PassPickResult =
  { status: "passed" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };

/**
 * Passes on one of the caller's own picks. Shared by the website's `passPick` action and the mobile
 * `POST /picks/{id}/pass` route, so both apply the same rules: the pick must belong to the caller
 * (someone else's looks exactly like one that does not exist) and must still be undecided. A passed
 * pick is never listed again (`getPicksForActor` only returns undecided items); after a second
 * pass of the same person the matching code never offers them again (C8).
 */
export async function passPickStep(
  db: PassPickDb,
  person: { userId: string },
  batchItemId: string,
  now: Date = new Date(),
): Promise<PassPickResult> {
  const item = await db.batchItem.findUnique({
    where: { id: batchItemId },
    select: { id: true, decision: true, dailyBatch: { select: { userId: true } } },
  });
  if (!item || item.dailyBatch.userId !== person.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (item.decision !== null) {
    return { status: "error", code: "ALREADY_DECIDED" };
  }
  await db.batchItem.update({
    where: { id: item.id },
    data: { decision: "PASSED", decidedAt: now },
  });
  return { status: "passed" };
}

export type SendWaveDb = PassPickDb &
  Pick<PrismaClient, "wave" | "match" | "block" | "conversation" | "notification" | "$transaction">;

export type SendWaveResult =
  | { status: "sent"; matched: boolean }
  | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" | "BLOCKED" | "DAILY_CAP_REACHED" };

/**
 * Sends a wave from one still-actionable pick (S12's "wave composer"). Shared by the
 * website's `sendWave` action and the mobile `POST /picks/{id}/wave` route: the 8/day
 * cap and block check (S14), and completing a match immediately if the target already
 * waved at the actor first (`formMatch`) — `waveBackStep` (`src/server/waves/service.ts`)
 * is the mirror image of this for the inbox's other direction.
 */
export async function sendWaveStep(
  db: SendWaveDb,
  person: { userId: string },
  batchItemId: string,
  targetElement: TargetElement,
  note: string | undefined,
  now: Date = new Date(),
): Promise<SendWaveResult> {
  const item = await db.batchItem.findUnique({
    where: { id: batchItemId },
    select: { id: true, decision: true, candidateUserId: true, dailyBatch: { select: { userId: true } } },
  });
  if (!item || item.dailyBatch.userId !== person.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (item.decision !== null) {
    return { status: "error", code: "ALREADY_DECIDED" };
  }

  // The same person can appear as a candidate in more than one of today's intent
  // batches — waving is a person-level action (Wave.fromUserId/toUserId is unique), so
  // a second wave at someone already waved at just marks this pick decided too, rather
  // than erroring or creating a duplicate Wave row.
  const existingWave = await db.wave.findUnique({
    where: { fromUserId_toUserId: { fromUserId: person.userId, toUserId: item.candidateUserId } },
    select: { id: true },
  });
  if (existingWave) {
    await db.batchItem.update({ where: { id: item.id }, data: { decision: "WAVED", decidedAt: now } });
    return { status: "sent", matched: false };
  }

  if (await isBlockedEitherWay(db, person.userId, item.candidateUserId)) {
    return { status: "error", code: "BLOCKED" };
  }
  if ((await countWavesSentToday(db, person.userId)) >= DAILY_WAVE_CAP) {
    return { status: "error", code: "DAILY_CAP_REACHED" };
  }

  // The candidate may already have waved at the actor first (from their own picks, or
  // the waves inbox) — if so, this wave completes the pair into a match right away
  // instead of sitting PENDING until some future reciprocal action.
  const reverseWave = await db.wave.findUnique({
    where: { fromUserId_toUserId: { fromUserId: item.candidateUserId, toUserId: person.userId } },
    select: { id: true, status: true },
  });
  const mutual = reverseWave?.status === "PENDING";

  await db.$transaction(async (tx) => {
    await tx.batchItem.update({ where: { id: item.id }, data: { decision: "WAVED", decidedAt: now } });
    const wave = await tx.wave.create({
      data: {
        batchItemId: item.id,
        fromUserId: person.userId,
        toUserId: item.candidateUserId,
        targetElement,
        note: note ?? null,
        status: mutual ? "MATCHED" : "PENDING",
      },
    });
    if (mutual && reverseWave) {
      await formMatch(tx, person.userId, item.candidateUserId, reverseWave.id);
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

  return { status: "sent", matched: mutual };
}
