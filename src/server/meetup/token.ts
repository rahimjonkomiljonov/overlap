import { randomBytes } from "node:crypto";

/**
 * A high-entropy, URL-safe bearer token for E3's "share my plans" link (`PlanShareLink`).
 * It's a capability meant to be clicked, not typed in like an OTP code, so it's stored
 * as-is rather than hashed (see the model's own doc comment in prisma/schema.prisma).
 */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}
