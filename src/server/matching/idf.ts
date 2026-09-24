import { IdfFeatureType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

export type IdfStatsDb = Pick<
  PrismaClient,
  "profile" | "profileCourse" | "profileClub" | "profileInterestTag" | "idfStat"
>;

export interface IdfStatsSummary {
  eligibleUserCount: number;
  statsWritten: number;
}

/** w(x) = log(N / (1 + n_x)), capped at 0 so a feature no rarer than "everyone has it" never goes negative (REQUIREMENTS.md §5.2). */
export function computeIdf(totalUsers: number, featureCount: number): number {
  return Math.max(0, Math.log(totalUsers / (1 + featureCount)));
}

/**
 * Refreshes `IdfStat` for one campus ("IdfStat ... refreshed nightly", REQUIREMENTS.md
 * §10 — S11 wires this to an actual nightly cron; this is the job function itself). N is
 * the campus's eligible pool — verified, profile-complete users, the same population
 * S10's candidate query searches — and n_x is how many of those users have each
 * course/club/interest. Real campuses and synthetic ones (S09) run through the exact
 * same function; nothing here knows or cares which kind a campus is.
 */
export async function computeIdfStats(db: IdfStatsDb, campusId: string): Promise<IdfStatsSummary> {
  const eligibleProfiles = await db.profile.findMany({
    where: { completedAt: { not: null }, user: { campusId, verifiedAt: { not: null } } },
    select: { id: true },
  });
  const profileIds = eligibleProfiles.map((p) => p.id);
  const eligibleUserCount = profileIds.length;

  if (profileIds.length === 0) {
    return { eligibleUserCount: 0, statsWritten: 0 };
  }

  const [courseCounts, clubCounts, interestCounts] = await Promise.all([
    db.profileCourse.groupBy({
      by: ["courseId"],
      where: { profileId: { in: profileIds } },
      _count: { profileId: true },
    }),
    db.profileClub.groupBy({
      by: ["clubId"],
      where: { profileId: { in: profileIds } },
      _count: { profileId: true },
    }),
    db.profileInterestTag.groupBy({
      by: ["interestTagId"],
      where: { profileId: { in: profileIds } },
      _count: { profileId: true },
    }),
  ]);

  const rows = [
    ...courseCounts.map((r) => ({ featureType: IdfFeatureType.COURSE, featureId: r.courseId, count: r._count.profileId })),
    ...clubCounts.map((r) => ({ featureType: IdfFeatureType.CLUB, featureId: r.clubId, count: r._count.profileId })),
    ...interestCounts.map((r) => ({
      featureType: IdfFeatureType.INTEREST,
      featureId: r.interestTagId,
      count: r._count.profileId,
    })),
  ];

  for (const row of rows) {
    const idf = computeIdf(eligibleUserCount, row.count);
    await db.idfStat.upsert({
      where: {
        campusId_featureType_featureId: { campusId, featureType: row.featureType, featureId: row.featureId },
      },
      update: { count: row.count, idf },
      create: { campusId, featureType: row.featureType, featureId: row.featureId, count: row.count, idf },
    });
  }

  return { eligibleUserCount, statsWritten: rows.length };
}
