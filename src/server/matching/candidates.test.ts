import { Gender, IntentMode } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { encryptField } from "@/server/privacy/encryption";
import { loadCampusMatchPool, type CandidateDb } from "./candidates";

interface FakeUserRow {
  id: string;
  campusId: string;
  verifiedAt: Date | null;
  lastActiveAt: Date;
  createdAt: Date;
  profile: {
    completedAt: Date | null;
    intents: string[];
    gender: Gender;
    interestedIn: string | null;
    freeTimeSlots: number[];
    valuesAnswers: number[];
    courses: { courseId: string; sectionId: string | null }[];
    clubs: { clubId: string }[];
    spots: { spotId: string }[];
    interests: { interestTagId: string }[];
  } | null;
}

function baseUser(overrides: Partial<FakeUserRow> & { id: string }): FakeUserRow {
  return {
    campusId: "campus-a",
    verifiedAt: new Date("2026-09-01"),
    lastActiveAt: new Date("2026-09-25"),
    createdAt: new Date("2026-09-01"),
    profile: {
      completedAt: new Date("2026-09-01"),
      intents: [IntentMode.FRIENDS],
      gender: Gender.WOMAN,
      interestedIn: null,
      freeTimeSlots: [],
      valuesAnswers: [3, 3, 3, 3, 3, 3, 3, 3],
      courses: [],
      clubs: [],
      spots: [],
      interests: [],
    },
    ...overrides,
  };
}

function fakeDb(
  users: FakeUserRow[],
  blocks: { blockerId: string; blockedId: string }[] = [],
  hideRules: { userId: string; hiddenUserId: string }[] = [],
  batches: { userId: string; intent: string; batchDate: Date; candidateUserIds: string[] }[] = [],
): CandidateDb {
  return {
    user: {
      findMany: async ({ where }: { where: { campusId: string; verifiedAt: unknown; lastActiveAt: { gte: Date }; profile: { completedAt: unknown; intents: { has: string } } } }) =>
        users
          .filter((u) => u.campusId === where.campusId)
          .filter((u) => u.verifiedAt !== null)
          .filter((u) => u.lastActiveAt.getTime() >= where.lastActiveAt.gte.getTime())
          .filter((u) => u.profile !== null && u.profile.completedAt !== null)
          .filter((u) => u.profile!.intents.includes(where.profile.intents.has))
          .map((u) => ({ id: u.id, createdAt: u.createdAt, profile: u.profile })),
    },
    block: {
      findMany: async ({ where }: { where: { OR: { blockerId?: { in: string[] }; blockedId?: { in: string[] } }[] } }) => {
        const ids = new Set([...(where.OR[0].blockerId?.in ?? []), ...(where.OR[1].blockedId?.in ?? [])]);
        return blocks.filter((b) => ids.has(b.blockerId) || ids.has(b.blockedId));
      },
    },
    hideRule: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
        hideRules.filter((h) => where.userId.in.includes(h.userId)),
    },
    dailyBatch: {
      findMany: async ({ where }: { where: { userId: { in: string[] }; intent: string; batchDate: { gte: Date } } }) =>
        batches
          .filter((b) => where.userId.in.includes(b.userId))
          .filter((b) => b.intent === where.intent)
          .filter((b) => b.batchDate.getTime() >= where.batchDate.gte.getTime())
          .map((b) => ({ userId: b.userId, items: b.candidateUserIds.map((id) => ({ candidateUserId: id })) })),
    },
  } as unknown as CandidateDb;
}

const NOW = new Date("2026-09-26T00:00:00Z");

describe("loadCampusMatchPool", () => {
  it("only includes verified, profile-complete, recently-active users on the given campus who opted into the intent", async () => {
    const users = [
      baseUser({ id: "ok" }),
      baseUser({ id: "wrong-campus", campusId: "campus-b" }),
      baseUser({ id: "unverified", verifiedAt: null }),
      baseUser({ id: "incomplete-profile", profile: { ...baseUser({ id: "x" }).profile!, completedAt: null } }),
      baseUser({ id: "inactive", lastActiveAt: new Date("2026-08-01") }),
      baseUser({ id: "wrong-intent", profile: { ...baseUser({ id: "x" }).profile!, intents: [IntentMode.STUDY] } }),
    ];
    const result = await loadCampusMatchPool(fakeDb(users), "campus-a", IntentMode.FRIENDS, { now: NOW });
    expect(result.profiles.map((p) => p.userId)).toEqual(["ok"]);
  });

  it("decrypts interestedIn only when loading for the DATING intent", async () => {
    const encrypted = encryptField(JSON.stringify([Gender.MAN]));
    const users = [
      baseUser({
        id: "dater",
        profile: { ...baseUser({ id: "x" }).profile!, intents: [IntentMode.DATING], interestedIn: encrypted },
      }),
    ];
    const forDating = await loadCampusMatchPool(fakeDb(users), "campus-a", IntentMode.DATING, { now: NOW });
    expect(forDating.profiles[0].interestedIn).toEqual([Gender.MAN]);

    const usersFriends = [
      baseUser({
        id: "friend",
        profile: {
          ...baseUser({ id: "x" }).profile!,
          intents: [IntentMode.FRIENDS],
          interestedIn: encrypted,
        },
      }),
    ];
    const forFriends = await loadCampusMatchPool(fakeDb(usersFriends), "campus-a", IntentMode.FRIENDS, { now: NOW });
    // Present in the row, but never decrypted for a non-Dating intent — it isn't a hard filter there.
    expect(forFriends.profiles[0].interestedIn).toBeNull();
  });

  it("normalizes blocked pairs both ways regardless of who blocked whom", async () => {
    const users = [baseUser({ id: "a" }), baseUser({ id: "b" })];
    const pool = await loadCampusMatchPool(fakeDb(users, [{ blockerId: "b", blockedId: "a" }]), "campus-a", IntentMode.FRIENDS, {
      now: NOW,
    });
    expect(pool.blockedPairs.has("a:b")).toBe(true);
  });

  it("builds a one-directional hide map — only the rule owner's own list is affected", async () => {
    const users = [baseUser({ id: "a" }), baseUser({ id: "b" })];
    const pool = await loadCampusMatchPool(fakeDb(users, [], [{ userId: "a", hiddenUserId: "b" }]), "campus-a", IntentMode.FRIENDS, {
      now: NOW,
    });
    expect(pool.hiddenBy.get("a")?.has("b")).toBe(true);
    expect(pool.hiddenBy.get("b")?.has("a")).toBeFalsy();
  });

  it("builds recently-shown from batch history within the last 30 days, scoped to this intent", async () => {
    const users = [baseUser({ id: "a" }), baseUser({ id: "b" }), baseUser({ id: "c" })];
    const batches = [
      { userId: "a", intent: IntentMode.FRIENDS, batchDate: new Date("2026-09-20"), candidateUserIds: ["b"] },
      { userId: "a", intent: IntentMode.STUDY, batchDate: new Date("2026-09-20"), candidateUserIds: ["c"] },
    ];
    const pool = await loadCampusMatchPool(fakeDb(users, [], [], batches), "campus-a", IntentMode.FRIENDS, { now: NOW });
    expect(pool.recentlyShown.get("a")?.has("b")).toBe(true);
    expect(pool.recentlyShown.get("a")?.has("c")).toBeFalsy();
  });
});
