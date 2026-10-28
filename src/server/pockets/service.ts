import type { PrismaClient } from "@/generated/prisma/client";
import { enqueueNotification } from "@/server/notifications/queue";
import { isBlockedEitherWay } from "@/server/waves/blocks";
import { countWavesSentToday, DAILY_WAVE_CAP } from "@/server/waves/cap";
import { formMatch } from "@/server/waves/match";
import { isPocketMember, type PocketsDb } from "./queries";
import type { PocketKind } from "./rules";

export type WaveFromPocketDb = PocketsDb & Pick<PrismaClient, "conversation" | "notification" | "$transaction">;

export type WaveFromPocketResult =
  | { status: "sent"; matched: boolean }
  | { status: "error"; code: "NOT_FOUND" | "BLOCKED" | "DAILY_CAP_REACHED" };

/**
 * Sends a wave to someone the caller can currently see in one of their pockets. Shared by the
 * website's `waveFromPocket` action and the mobile wave route, so both apply the same rules as a
 * Daily-Picks wave (8/day cap, block check, mutual match): the target is re-checked as a current
 * pocket member here rather than trusted from the caller, since the page/screen that showed them
 * may be stale.
 */
export async function waveFromPocketStep(
  db: WaveFromPocketDb,
  viewer: { userId: string; campusId: string },
  kind: PocketKind,
  pocketId: string,
  toUserId: string,
  note: string | undefined,
): Promise<WaveFromPocketResult> {
  if (!(await isPocketMember(db, viewer, kind, pocketId, toUserId))) {
    return { status: "error", code: "NOT_FOUND" };
  }

  const existing = await db.wave.findUnique({
    where: { fromUserId_toUserId: { fromUserId: viewer.userId, toUserId } },
    select: { id: true },
  });
  if (existing) return { status: "sent", matched: false };

  if (await isBlockedEitherWay(db, viewer.userId, toUserId)) {
    return { status: "error", code: "BLOCKED" };
  }
  if ((await countWavesSentToday(db, viewer.userId)) >= DAILY_WAVE_CAP) {
    return { status: "error", code: "DAILY_CAP_REACHED" };
  }

  const reverseWave = await db.wave.findUnique({
    where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: viewer.userId } },
    select: { id: true, status: true },
  });
  const mutual = reverseWave?.status === "PENDING";

  await db.$transaction(async (tx) => {
    const wave = await tx.wave.create({
      data: {
        fromUserId: viewer.userId,
        toUserId,
        targetElement: { type: "profile" },
        note: note ?? null,
        status: mutual ? "MATCHED" : "PENDING",
      },
    });
    if (mutual && reverseWave) {
      await formMatch(tx, viewer.userId, toUserId, reverseWave.id);
    } else {
      await enqueueNotification(tx, {
        userId: toUserId,
        type: "WAVE_RECEIVED",
        dedupeKey: `wave-received:${wave.id}`,
      });
    }
  });

  return { status: "sent", matched: mutual };
}
