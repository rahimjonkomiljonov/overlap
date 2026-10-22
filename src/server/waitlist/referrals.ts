import type { PrismaClient } from "@/generated/prisma/client";

export type ReferralDb = Pick<PrismaClient, "waitlist">;

/**
 * How many friends have joined (verified their email) through this waitlist entry's
 * invite link. Returns a number only, never who they are. People who opened the link
 * but never verified don't count.
 */
export async function countVerifiedReferrals(db: ReferralDb, waitlistId: string): Promise<number> {
  return db.waitlist.count({ where: { referredById: waitlistId, verifiedAt: { not: null } } });
}
