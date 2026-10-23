import { resolveCampusForEmail, type CampusLookupDb } from "./campus";
import { normalizeEmail } from "./hash";
import { checkRateLimit, type RateLimitDb } from "./rate-limit";

/**
 * Better Auth exposes its own HTTP endpoints at /api/auth/*. Our server actions check the school
 * email before they call it, but anyone can call these endpoints directly, so the same rule has to
 * hold here too (the mobile apps use these endpoints, there is no server action in between).
 *
 * Every email-code route that carries an address is listed. A route that is not listed is not
 * email-bearing (get-session, sign-out, ...) and passes through untouched.
 */
export const EMAIL_CODE_PATHS: ReadonlySet<string> = new Set([
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
]);

/** Routes that make us send an email. Looser than the web form's own limit (3 per 15 minutes) so the web flow never trips this one first. */
const SEND_PATHS: ReadonlySet<string> = new Set([
  "/email-otp/send-verification-otp",
  "/email-otp/request-email-change",
  "/email-otp/request-password-reset",
]);
export const SEND_RATE_LIMIT = { max: 6, windowMs: 15 * 60 * 1000 };

export type AuthGuardDb = CampusLookupDb & RateLimitDb;
export type AuthGuardResult = { ok: true } | { ok: false; code: "INVALID_INPUT" | "INVALID_DOMAIN" | "RATE_LIMITED" };

/** Pulls every address out of a request body: `email`, and `newEmail` for an email change. */
function addressesIn(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const found: string[] = [];
  for (const key of ["email", "newEmail"]) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return null;
    found.push(value);
  }
  return found.length > 0 ? found : null;
}

export async function guardAuthRequest(db: AuthGuardDb, path: string, body: unknown): Promise<AuthGuardResult> {
  if (!EMAIL_CODE_PATHS.has(path)) return { ok: true };

  const addresses = addressesIn(body);
  if (!addresses) return { ok: false, code: "INVALID_INPUT" };

  for (const address of addresses) {
    if (!(await resolveCampusForEmail(db, address))) return { ok: false, code: "INVALID_DOMAIN" };
  }

  if (SEND_PATHS.has(path)) {
    const email = normalizeEmail(addresses[0]);
    const rate = await checkRateLimit(db, `auth-send:${path}:${email}`, SEND_RATE_LIMIT);
    if (!rate.allowed) return { ok: false, code: "RATE_LIMITED" };
  }
  return { ok: true };
}
