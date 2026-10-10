import type { PrismaClient } from "@/generated/prisma/client";
import { ModerationActionType, UserStatus } from "@/generated/prisma/enums";

export type SuspensionsDb = Pick<PrismaClient, "user">;

export interface SuspendedUserRow {
  userId: string;
  firstName: string | null;
  suspendedUntil: Date | null;
  /** The moderator's own note on the most recent suspension, if one is on record. */
  reason: string | null;
  suspendedAt: Date | null;
}

/** Everyone currently suspended, soonest to end first. Moderators and admins only (the admin layout and the action both check). */
export async function getSuspendedUsers(db: SuspensionsDb): Promise<SuspendedUserRow[]> {
  const users = await db.user.findMany({
    where: { status: UserStatus.SUSPENDED },
    select: {
      id: true,
      suspendedUntil: true,
      profile: { select: { firstName: true } },
      moderationActionsReceived: {
        where: { type: ModerationActionType.SUSPEND },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { reason: true, createdAt: true },
      },
    },
  });

  return users
    .map((u) => ({
      userId: u.id,
      firstName: u.profile?.firstName ?? null,
      suspendedUntil: u.suspendedUntil,
      reason: u.moderationActionsReceived[0]?.reason ?? null,
      suspendedAt: u.moderationActionsReceived[0]?.createdAt ?? null,
    }))
    .sort((a, b) => (a.suspendedUntil?.getTime() ?? Infinity) - (b.suspendedUntil?.getTime() ?? Infinity));
}

export type LiftSuspensionCheck = { ok: true } | { ok: false; code: "NOT_SUSPENDED" | "OWN_ACCOUNT" };

/**
 * Whether a moderator may lift this suspension. Not your own (a suspended moderator
 * can't reinstate themselves), and only an account that is actually suspended: a ban
 * or a deleted account is never changed by this action.
 */
export function checkLiftSuspension(input: {
  actorId: string;
  targetId: string;
  targetStatus: UserStatus | null;
}): LiftSuspensionCheck {
  if (input.actorId === input.targetId) return { ok: false, code: "OWN_ACCOUNT" };
  if (input.targetStatus !== UserStatus.SUSPENDED) return { ok: false, code: "NOT_SUSPENDED" };
  return { ok: true };
}
