import type { PrismaClient } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { captureError } from "@/server/logging";
import type { Actor } from "./authz";

/** How stale `lastActiveAt` must be before resolveActor() bothers writing it again. */
export const ACTIVITY_TOUCH_THROTTLE_MS = 60 * 60 * 1000;

export type ActorDb = Pick<PrismaClient, "user">;

/** What Better Auth's getSession gives back, reduced to the one thing we use. */
export type SessionLookup = () => Promise<{ user: { id: string } } | null>;

/**
 * Turns a session into an `Actor`, shared by the website (cookies, via next/headers) and the
 * mobile API (the same cookie, sent by the app). One implementation, so the two can never
 * disagree about who someone is or what state their account is in.
 *
 * Better Auth's own session payload only carries the identity fields it manages
 * (id/name/email/...). Our domain fields (campusId, status, role) live in the same table but
 * are read here with our own query, keeping "who is authenticated" and "what are their domain
 * attributes" as two separate concerns.
 *
 * Returns null for: no session (missing or expired, Better Auth decides that), or a session whose
 * user row no longer exists.
 */
export async function resolveActor(getSession: SessionLookup, db: ActorDb, now: Date = new Date()): Promise<Actor> {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { campusId: true, status: true, suspendedUntil: true, trustScore: true, role: true, lastActiveAt: true },
  });
  if (!user) return null;

  if (now.getTime() - user.lastActiveAt.getTime() > ACTIVITY_TOUCH_THROTTLE_MS) {
    // Fire-and-forget: this is the "active in the last 14 days" candidate-generation filter's only
    // writer (src/server/matching/candidates.ts), and it must never make a request wait on an extra
    // write. A failure is logged, scrubbed, via the one designated chokepoint.
    void db.user
      .update({ where: { id: session.user.id }, data: { lastActiveAt: now } })
      .catch((error) => captureError("session.touchLastActiveAt", error, { userId: session.user.id }));
  }

  // G8's 7-day suspension expires on its own: lazily flip back to ACTIVE the next time the account
  // is seen, rather than needing a separate reinstatement job. A ban has no `suspendedUntil` and is
  // never reversed this way; only a moderator action changes it.
  let status = user.status;
  if (status === UserStatus.SUSPENDED && user.suspendedUntil !== null && user.suspendedUntil <= now) {
    status = UserStatus.ACTIVE;
    void db.user
      .update({ where: { id: session.user.id }, data: { status: UserStatus.ACTIVE, suspendedUntil: null } })
      .catch((error) => captureError("session.expireSuspension", error, { userId: session.user.id }));
  }

  return { userId: session.user.id, campusId: user.campusId ?? "", role: user.role, status };
}
