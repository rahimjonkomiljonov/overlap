import type { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitDb } from "@/server/auth/rate-limit";
import { mobileError } from "./guard";

/**
 * Per-person request limit for a mobile route, on top of any business rule (such as the daily wave
 * cap). Returns the 429 response to send when the limit is hit, or null to carry on:
 *
 *   const limited = await enforceRateLimit(prisma, `waves:${actor.userId}`, { max: 30, windowMs: 60_000 });
 *   if (limited) return limited;
 *
 * Always key it on the signed-in person, never on something the caller controls.
 */
export async function enforceRateLimit(
  db: RateLimitDb,
  key: string,
  options: { max: number; windowMs: number },
): Promise<NextResponse | null> {
  const result = await checkRateLimit(db, `mobile:${key}`, options);
  return result.allowed ? null : mobileError("RATE_LIMITED");
}
