import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Fixed-window rate limiting backed by Postgres (RateLimit table) — the Month-1 choice
 * over Redis, see REQUIREMENTS.md §9. Takes the Prisma client as a parameter rather
 * than importing the singleton, so tests can pass a minimal fake instead of hitting a
 * real database (see rate-limit.test.ts).
 *
 * Read-then-write, not a single atomic SQL statement: under truly concurrent requests
 * for the same key within the same instant, two requests could both read "not yet at
 * the limit" and both succeed. Acceptable for Month-1 traffic (a handful of OTP
 * requests, not a high-throughput endpoint); S20's hardening pass can move this to a
 * single `INSERT ... ON CONFLICT` statement if it turns out to matter.
 */

export type RateLimitDb = Pick<PrismaClient, "rateLimit">;

export type RateLimitResult = {
  allowed: boolean;
  /** Requests still allowed in the current window (0 once blocked). */
  remaining: number;
  /** When the current window ends and the count resets. */
  resetAt: Date;
};

export async function checkRateLimit(
  db: RateLimitDb,
  key: string,
  options: { max: number; windowMs: number },
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const existing = await db.rateLimit.findUnique({ where: { key } });

  const windowExpired = !existing || now.getTime() >= existing.windowEnds.getTime();

  if (windowExpired) {
    const windowEnds = new Date(now.getTime() + options.windowMs);
    await db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowEnds },
      update: { count: 1, windowEnds },
    });
    return { allowed: true, remaining: options.max - 1, resetAt: windowEnds };
  }

  if (existing.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: existing.windowEnds };
  }

  await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return {
    allowed: true,
    remaining: options.max - existing.count - 1,
    resetAt: existing.windowEnds,
  };
}
