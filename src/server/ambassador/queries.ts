import type { PrismaClient } from "@/generated/prisma/client";
import { computeCohortDensity, DENSITY_GATE } from "@/server/cohorts/release";

/** Below this many eligible people, a cohort's gender shares aren't shown (too identifying). */
export const MIN_COHORT_SIZE_FOR_SHARES = 10;

export interface AmbassadorDashboard {
  codes: {
    code: string;
    useCount: number;
    maxUses: number;
    expired: boolean;
    cohortName: string;
  }[];
  /** People who joined with this ambassador's codes, as counts only (never names). */
  invitees: { joined: number; verified: number; profileComplete: number; activeThisWeek: number };
  referrals: { sent: number; joined: number };
  cohorts: {
    name: string;
    datingOpen: boolean;
    eligible: number;
    minEligible: number;
    /** Null when the cohort is too small to show shares without identifying people. */
    womenShare: number | null;
    menShare: number | null;
    minShare: number;
    passes: boolean;
  }[];
}

export type AmbassadorDb = Pick<PrismaClient, "inviteCode" | "user" | "referral">;

/**
 * J4: an ambassador's own invites and how their cohorts are activating. Scoped to codes
 * the ambassador owns and referrals they sent; everything about other people is an
 * aggregate count.
 */
export async function getAmbassadorDashboard(
  db: AmbassadorDb,
  userId: string,
  now: Date = new Date(),
): Promise<AmbassadorDashboard> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const mine = { inviteCode: { ownerId: userId } };

  const [codes, joined, verified, profileComplete, activeThisWeek, sent, referred] = await Promise.all([
    db.inviteCode.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        code: true,
        useCount: true,
        maxUses: true,
        expiresAt: true,
        cohort: { select: { id: true, name: true, datingOpen: true } },
      },
    }),
    db.user.count({ where: mine }),
    db.user.count({ where: { ...mine, verifiedAt: { not: null } } }),
    db.user.count({ where: { ...mine, profile: { completedAt: { not: null } } } }),
    db.user.count({ where: { ...mine, lastActiveAt: { gte: weekAgo } } }),
    db.referral.count({ where: { referrerId: userId } }),
    db.referral.count({ where: { referrerId: userId, referredUserId: { not: null } } }),
  ]);

  const cohortById = new Map(codes.map((c) => [c.cohort.id, c.cohort]));
  const cohorts = await Promise.all(
    [...cohortById.values()].map(async (cohort) => {
      const density = await computeCohortDensity(db, cohort.id);
      const showShares = density.eligible >= MIN_COHORT_SIZE_FOR_SHARES;
      return {
        name: cohort.name,
        datingOpen: cohort.datingOpen,
        eligible: density.eligible,
        minEligible: DENSITY_GATE.minEligibleUsers,
        womenShare: showShares ? density.womenShare : null,
        menShare: showShares ? density.menShare : null,
        minShare: DENSITY_GATE.minGenderShare,
        passes: density.passes,
      };
    }),
  );

  return {
    codes: codes.map((c) => ({
      code: c.code,
      useCount: c.useCount,
      maxUses: c.maxUses,
      expired: c.expiresAt !== null && c.expiresAt <= now,
      cohortName: c.cohort.name,
    })),
    invitees: { joined, verified, profileComplete, activeThisWeek },
    referrals: { sent, joined: referred },
    cohorts,
  };
}
