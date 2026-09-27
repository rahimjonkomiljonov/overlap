import type { PrismaClient } from "@/generated/prisma/client";
import { seoulDayRange } from "@/server/matching/seoul-date";

/** REQUIREMENTS.md D1: "max 8 waves/day." */
export const DAILY_WAVE_CAP = 8;

/**
 * S20 hardening: a short-window request-rate limit distinct from the 8/day *business*
 * cap above — that cap only counts waves that actually succeed, so a scripted client
 * could otherwise hammer `sendWave`/`waveBack` (bad candidate ids, races against the cap
 * check) at unlimited frequency before ever hitting it. Shared by both entry points via
 * the same `wave-attempt:<userId>` rate-limit key, so alternating between them doesn't
 * double the effective budget. Lives here (a plain module both already import from),
 * not in either action file, since a `"use server"` file may only export async
 * functions — see CLAUDE.md.
 */
export const WAVE_ATTEMPT_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

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
