import { describe, expect, it } from "vitest";
import { computeIdf, computeIdfStats, type IdfStatsDb } from "./idf";

describe("computeIdf", () => {
  it("gives a rarer feature a higher weight than a common one", () => {
    const rare = computeIdf(100, 2);
    const common = computeIdf(100, 90);
    expect(rare).toBeGreaterThan(common);
  });

  it("never goes negative, even when featureCount exceeds totalUsers", () => {
    expect(computeIdf(10, 50)).toBe(0);
  });

  it("matches the documented formula log(N / (1 + n_x))", () => {
    expect(computeIdf(100, 9)).toBeCloseTo(Math.log(100 / 10), 10);
  });
});

interface FakeProfile {
  id: string;
  campusId: string;
  verified: boolean;
  completed: boolean;
}

interface FakeJoinRow {
  profileId: string;
  featureId: string;
}

function fakeDb(
  profiles: FakeProfile[],
  courseRows: FakeJoinRow[],
  clubRows: FakeJoinRow[],
  interestRows: FakeJoinRow[],
): { db: IdfStatsDb; upserts: { where: unknown; create: unknown; update: unknown }[] } {
  const upserts: { where: unknown; create: unknown; update: unknown }[] = [];

  function groupBy(rows: FakeJoinRow[], profileIds: Set<string>, key: "courseId" | "clubId" | "interestTagId") {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!profileIds.has(row.profileId)) continue;
      counts.set(row.featureId, (counts.get(row.featureId) ?? 0) + 1);
    }
    return [...counts.entries()].map(([featureId, count]) => ({
      [key]: featureId,
      _count: { profileId: count },
    }));
  }

  const db = {
    profile: {
      findMany: async ({ where }: { where: { completedAt: unknown; user: { campusId: string; verifiedAt: unknown } } }) =>
        profiles
          .filter((p) => p.completed && p.verified && p.campusId === where.user.campusId)
          .map((p) => ({ id: p.id })),
    },
    profileCourse: {
      groupBy: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        groupBy(courseRows, new Set(where.profileId.in), "courseId"),
    },
    profileClub: {
      groupBy: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        groupBy(clubRows, new Set(where.profileId.in), "clubId"),
    },
    profileInterestTag: {
      groupBy: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        groupBy(interestRows, new Set(where.profileId.in), "interestTagId"),
    },
    idfStat: {
      upsert: async (args: { where: unknown; create: unknown; update: unknown }) => {
        upserts.push(args);
        return args.create;
      },
    },
  } as unknown as IdfStatsDb;

  return { db, upserts };
}

describe("computeIdfStats", () => {
  it("only counts verified, profile-complete users on the given campus", async () => {
    const profiles: FakeProfile[] = [
      { id: "p1", campusId: "campus-a", verified: true, completed: true },
      { id: "p2", campusId: "campus-a", verified: false, completed: true }, // not verified
      { id: "p3", campusId: "campus-a", verified: true, completed: false }, // not complete
      { id: "p4", campusId: "campus-b", verified: true, completed: true }, // other campus
    ];
    const courseRows = [
      { profileId: "p1", featureId: "course-x" },
      { profileId: "p2", featureId: "course-x" },
      { profileId: "p4", featureId: "course-x" },
    ];
    const { db, upserts } = fakeDb(profiles, courseRows, [], []);

    const summary = await computeIdfStats(db, "campus-a");

    expect(summary.eligibleUserCount).toBe(1);
    expect(summary.statsWritten).toBe(1);
    expect(upserts[0].create).toMatchObject({ campusId: "campus-a", featureType: "COURSE", featureId: "course-x", count: 1 });
  });

  it("writes one stat row per feature across course/club/interest", async () => {
    const profiles: FakeProfile[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      campusId: "campus-a",
      verified: true,
      completed: true,
    }));
    // course-x: 8 of 10 profiles (common). club-y: 1 of 10 (rare). interest-z: 5 of 10.
    const courseRows = profiles.slice(0, 8).map((p) => ({ profileId: p.id, featureId: "course-x" }));
    const clubRows = [{ profileId: "p0", featureId: "club-y" }];
    const interestRows = profiles.slice(0, 5).map((p) => ({ profileId: p.id, featureId: "interest-z" }));
    const { db, upserts } = fakeDb(profiles, courseRows, clubRows, interestRows);

    const summary = await computeIdfStats(db, "campus-a");

    expect(summary.eligibleUserCount).toBe(10);
    expect(summary.statsWritten).toBe(3);
    const byType = Object.fromEntries(
      upserts.map((u) => [(u.create as { featureType: string }).featureType, u.create]),
    );
    expect(byType.COURSE).toMatchObject({ featureId: "course-x", count: 8 });
    expect(byType.CLUB).toMatchObject({ featureId: "club-y", count: 1 });
    expect(byType.INTEREST).toMatchObject({ featureId: "interest-z", count: 5 });
    // The rarer feature (club-y) should score a strictly higher idf than the near-universal one (course-x).
    expect((byType.CLUB as { idf: number }).idf).toBeGreaterThan((byType.INTEREST as { idf: number }).idf);
    expect((byType.INTEREST as { idf: number }).idf).toBeGreaterThan((byType.COURSE as { idf: number }).idf);
  });

  it("writes nothing and never calls upsert when the campus has no eligible users", async () => {
    const { db, upserts } = fakeDb([], [], [], []);
    const summary = await computeIdfStats(db, "campus-a");
    expect(summary).toEqual({ eligibleUserCount: 0, statsWritten: 0 });
    expect(upserts).toHaveLength(0);
  });
});
