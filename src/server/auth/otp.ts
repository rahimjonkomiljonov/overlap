import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * 6-digit OTP codes (REQUIREMENTS.md A1), 10-minute expiry. Pure logic, no DB access —
 * callers (e.g. src/server/waitlist/actions.ts) own storing/looking up the hash.
 *
 * Unlike email hashing (src/server/auth/hash.ts), a plain SHA-256 is fine here: each
 * code is random per row and expires in minutes, so there is no meaningful guess-a-list
 * enumeration risk the way there is for a fixed, low-entropy campus email address. The
 * real protections are the short expiry and the caller's attempt cap.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
/** Same value in seconds, for libraries (e.g. Better Auth's emailOTP plugin) that want it that way. */
export const OTP_TTL_SECONDS = OTP_TTL_MS / 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("base64url");
}

export function otpExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}

export function isOtpExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/** Constant-time so response timing can't leak how close a guess was. */
export function otpMatches(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
