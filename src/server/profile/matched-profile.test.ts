import { describe, expect, it } from "vitest";
import { getMatchedProfile, type MatchedProfileDb } from "./matched-profile";

function fakeDb(options: { matched: boolean; blocked?: boolean }): MatchedProfileDb {
  return {
    match: {
      findFirst: async () => (options.matched ? { id: "match-1", conversation: { id: "conv-1" } } : null),
    },
    block: {
      // isBlockedEitherWay: any row between the two means blocked.
      findFirst: async () => (options.blocked ? { id: "b" } : null),
      findMany: async () => (options.blocked ? [{ blockerId: "viewer", blockedId: "other" }] : []),
    },
    profile: {
      findUnique: async () => ({
        firstName: "Min",
        year: 3,
        major: "컴퓨터공학과",
        photos: [],
        promptAnswers: [],
        interests: [],
      }),
    },
  } as unknown as MatchedProfileDb;
}

describe("getMatchedProfile", () => {
  it("returns the profile for an active match", async () => {
    const view = await getMatchedProfile(fakeDb({ matched: true }), "viewer", "other");
    expect(view).toMatchObject({ userId: "other", firstName: "Min", matchId: "match-1", conversationId: "conv-1" });
  });

  it("returns null when the two are not matched", async () => {
    expect(await getMatchedProfile(fakeDb({ matched: false }), "viewer", "other")).toBeNull();
  });

  it("returns null when either has blocked the other", async () => {
    expect(await getMatchedProfile(fakeDb({ matched: true, blocked: true }), "viewer", "other")).toBeNull();
  });

  it("never returns your own profile through this route", async () => {
    expect(await getMatchedProfile(fakeDb({ matched: true }), "viewer", "viewer")).toBeNull();
  });

  it("selects none of the private profile fields", async () => {
    const selects: unknown[] = [];
    const db = fakeDb({ matched: true });
    (db.profile as unknown as { findUnique: (args: { select: unknown }) => Promise<unknown> }).findUnique = async (args) => {
      selects.push(args.select);
      return { firstName: "Min", year: 3, major: null, photos: [], promptAnswers: [], interests: [] };
    };
    await getMatchedProfile(db, "viewer", "other");
    const keys = Object.keys(selects[0] as object);
    for (const forbidden of ["freeTimeSlots", "valuesAnswers", "interestedIn", "weightClasses", "weightInterests", "weightFreeTime", "gender"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
