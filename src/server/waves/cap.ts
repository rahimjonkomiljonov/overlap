import type { PrismaClient } from "@/generated/prisma/client";
import { seoulDayRange } from "@/server/matching/seoul-date";

/** REQUIREMENTS.md D1: "max 8 waves/day." */
export const DAILY_WAVE_CAP = 8;

export type WaveCapDb = Pick<PrismaClient, "wave">;

/** How many waves `userId` has sent so far in `now`'s Seoul calendar day. */
export async function countWavesSentToday(
  db: WaveCapDb,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const { start, end } = seoulDayRange(now);
  return db.wave.count({
    where: { fromUserId: userId, createdAt: { gte: start, lt: end } },
  });
}
