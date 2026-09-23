import { headers } from "next/headers";
import { UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { auth } from "./auth";
import type { Actor } from "./authz";

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
    select: { campusId: true, status: true, trustScore: true },
  });
  if (!user) return null;

  return {
    userId: session.user.id,
    campusId: user.campusId ?? "",
    // TODO(S08): no role column exists yet (admin console hasn't landed). Every
    // account is "user" until admin/moderator/ambassador role assignment is built.
    role: "user",
    status: user.status,
  };
}

/** Has an account, but hasn't finished onboarding (no campus assigned yet). */
export function needsOnboarding(actor: Actor): boolean {
  return actor !== null && actor.campusId === "" && actor.status !== UserStatus.DELETED;
}
