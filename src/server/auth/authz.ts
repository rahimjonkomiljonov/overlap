import { Role, UserStatus } from "@/generated/prisma/enums";

/**
 * Central authorization helper (S03). This is the shared vocabulary and the pure
 * decision logic; wiring an `Actor` to a real session is S05's job (auth/session
 * provider not chosen yet). Every server action and route handler must call one of
 * these guards itself — the proxy (src/proxy.ts) only routes locales, per CLAUDE.md.
 *
 * `Role` is the Prisma enum (S08) rather than a parallel string union, so the DB column
 * and this file's vocabulary can never drift apart.
 */

export { Role };

export type Actor = {
  userId: string;
  campusId: string;
  role: Role;
  status: UserStatus;
} | null;

export type AuthErrorCode = "UNAUTHENTICATED" | "ACCOUNT_RESTRICTED" | "FORBIDDEN";

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/** Statuses that may act normally. Paused/suspended/banned/deleted users cannot. */
const ACTIVE_STATUSES: ReadonlySet<UserStatus> = new Set([UserStatus.ACTIVE]);

const ROLE_RANK: Record<Role, number> = {
  [Role.USER]: 0,
  [Role.AMBASSADOR]: 1,
  [Role.MODERATOR]: 2,
  [Role.ADMIN]: 3,
};

/**
 * Throws unless there is a signed-in, active actor. Narrows the type so callers get a
 * non-null `Actor` back without a redundant null check.
 */
export function requireUser(actor: Actor): asserts actor is NonNullable<Actor> {
  if (!actor) {
    throw new AuthError("UNAUTHENTICATED", "Sign-in required.");
  }
  if (!ACTIVE_STATUSES.has(actor.status)) {
    throw new AuthError("ACCOUNT_RESTRICTED", `Account is ${actor.status.toLowerCase()}.`);
  }
}

/**
 * Throws unless the actor is signed in, active, and holds at least `role` (moderator
 * implies the access a plain user has, admin implies moderator, and so on).
 */
export function requireRole(actor: Actor, role: Role): asserts actor is NonNullable<Actor> {
  requireUser(actor);
  if (ROLE_RANK[actor.role] < ROLE_RANK[role]) {
    throw new AuthError("FORBIDDEN", `Requires role "${role}" or higher.`);
  }
}

/** Non-throwing check, for conditional UI or logic rather than a hard guard. */
export function can(actor: Actor, role: Role): boolean {
  try {
    requireRole(actor, role);
    return true;
  } catch {
    return false;
  }
}
