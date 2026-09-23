import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Keyed (HMAC) hash for campus email addresses.
 *
 * A plain, unkeyed hash (e.g. bare SHA-256) would NOT protect an email address here:
 * campus emails follow predictable patterns (student IDs, name.name@school.ac.kr), so
 * anyone could hash a list of guesses and compare against a leaked table to confirm
 * who has an account. HMAC with a server-only secret (EMAIL_HASH_PEPPER) prevents that.
 *
 * Not currently used by the live User record — Better Auth (src/server/auth/auth.ts)
 * manages the real, plaintext `email` column there, since it needs it for login and
 * notifications. This is reserved for the banned-identity re-registration block (A3,
 * see the TODO on the User model in prisma/schema.prisma), which records only a hash
 * once an account's plaintext email is purged — not built yet, no deletion flow exists.
 */

function pepper(): string {
  const value = process.env.EMAIL_HASH_PEPPER;
  if (!value || value.length < 32) {
    throw new Error("EMAIL_HASH_PEPPER is missing or too short (see .env.example).");
  }
  return value;
}

/** Trim, lowercase and collapse to the form used consistently for hashing and comparison. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return createHmac("sha256", pepper()).update(normalizeEmail(email)).digest("base64url");
}

/** Constant-time comparison, for the rare case a caller has a hash rather than an email. */
export function emailHashEquals(email: string, hash: string): boolean {
  const a = Buffer.from(hashEmail(email));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
