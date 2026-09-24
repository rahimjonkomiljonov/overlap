import { headers } from "next/headers";
import { UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { auth } from "./auth";
import type { Actor } from "./authz";

/** How stale `lastActiveAt` must be before getActor() bothers writing it again. */
const ACTIVITY_TOUCH_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Who is signed in, for server components/actions. Better Auth's own session payload
 * only carries the identity fields it manages (id/name/email/...) — our domain fields
 * (campusId, status, trustScore) live in the same table but are read here with our own
 * query, keeping "who is authenticated" and "what are their domain attributes" as two
 * separate concerns instead of depending on whether Better Auth happens to expose extra
 * columns.
 */
export async function getActor(): Promise<Actor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { campusId: true, status: true, trustScore: true, role: true, lastActiveAt: true },
  });
  if (!user) return null;

  if (Date.now() - user.lastActiveAt.getTime() > ACTIVITY_TOUCH_THROTTLE_MS) {
    // Fire-and-forget: this is the "active in the last 14 days" candidate-generation
    // filter's only writer (src/server/matching/candidates.ts), and it must never make a
    // page render wait on an extra write.
    void prisma.user.update({ where: { id: session.user.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }

  return {
    userId: session.user.id,
    campusId: user.campusId ?? "",
    role: user.role,
    status: user.status,
  };
}

/** Has an account, but hasn't finished onboarding (no campus assigned yet). */
export function needsOnboarding(actor: Actor): boolean {
  return actor !== null && actor.campusId === "" && actor.status !== UserStatus.DELETED;
}
