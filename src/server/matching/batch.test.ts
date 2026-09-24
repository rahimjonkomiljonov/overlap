import { Gender, IntentMode } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { computeCampusMatches } from "./batch";
import type { CampusMatchPool } from "./candidates";
import { buildIdfLookup } from "./terms";

type LoadedProfile = CampusMatchPool["profiles"][number];

function loadedProfile(overrides: Partial<LoadedProfile> & { userId: string }): LoadedProfile {
  return {
    gender: Gender.WOMAN,
    interestedIn: null,
    courses: [],
    clubIds: [],
    freeTimeSlots: [],
    spotIds: [],
    interestTagIds: [],
    valuesAnswers: [3, 3, 3, 3, 3, 3, 3, 3],
    ...overrides,
  };
}

function pool(profiles: CampusMatchPool["profiles"], overrides: Partial<CampusMatchPool> = {}): CampusMatchPool {
  return { profiles, blockedPairs: new Set(), hiddenBy: new Map(), recentlyShown: new Map(), ...overrides };
}

const EMPTY_IDF = buildIdfLookup([]);

describe("computeCampusMatches", () => {
  it("ranks candidates by descending score", () => {
    const a = loadedProfile({ userId: "a", clubIds: ["k1"] });
    const b = loadedProfile({ userId: "b", clubIds: ["k1"], courses: [{ courseId: "c1", sectionId: null }] });
    const c = loadedProfile({ userId: "c", courses: [{ courseId: "c1", sectionId: null }] });
    const results = computeCampusMatches(pool([a, b, c]), IntentMode.FRIENDS, EMPTY_IDF);

    const aList = results.get("a")!;
    expect(aList.map((r) => r.candidateUserId)).toEqual(["b", "c"]);
    expect(aList[0].score).toBeGreaterThanOrEqual(aList[1].score);
  });

  it("excludes a blocked pair from both people's lists", () => {
    const a = loadedProfile({ userId: "a", clubIds: ["k1"] });
    const b = loadedProfile({ userId: "b", clubIds: ["k1"] });
    const results = computeCampusMatches(pool([a, b], { blockedPairs: new Set(["a:b"]) }), IntentMode.FRIENDS, EMPTY_IDF);
    expect(results.get("a")).toEqual([]);
    expect(results.get("b")).toEqual([]);
  });

  it("a one-directional hide only removes the hidden person from the hider's own list", () => {
    const a = loadedProfile({ userId: "a", clubIds: ["k1"] });
    const b = loadedProfile({ userId: "b", clubIds: ["k1"] });
    const hiddenBy = new Map([["a", new Set(["b"])]]);
    const results = computeCampusMatches(pool([a, b], { hiddenBy }), IntentMode.FRIENDS, EMPTY_IDF);
    expect(results.get("a")).toEqual([]);
    // b never hid a, so a still appears in b's own list.
    expect(results.get("b")!.map((r) => r.candidateUserId)).toEqual(["a"]);
  });

  it("excludes a candidate the viewer was already shown recently, but not the reverse", () => {
    const a = loadedProfile({ userId: "a", clubIds: ["k1"] });
    const b = loadedProfile({ userId: "b", clubIds: ["k1"] });
    const recentlyShown = new Map([["a", new Set(["b"])]]);
    const results = computeCampusMatches(pool([a, b], { recentlyShown }), IntentMode.FRIENDS, EMPTY_IDF);
    expect(results.get("a")).toEqual([]);
    expect(results.get("b")!.map((r) => r.candidateUserId)).toEqual(["a"]);
  });

  it("applies the Dating gender hard filter, but never for Friends/Study", () => {
    const straightWoman = loadedProfile({ userId: "a", gender: Gender.WOMAN, interestedIn: [Gender.MAN], clubIds: ["k1"] });
    const otherWoman = loadedProfile({ userId: "b", gender: Gender.WOMAN, interestedIn: [Gender.MAN], clubIds: ["k1"] });

    const dating = computeCampusMatches(pool([straightWoman, otherWoman]), IntentMode.DATING, EMPTY_IDF);
    expect(dating.get("a")).toEqual([]);

    const friends = computeCampusMatches(pool([straightWoman, otherWoman]), IntentMode.FRIENDS, EMPTY_IDF);
    expect(friends.get("a")!.map((r) => r.candidateUserId)).toEqual(["b"]);
  });

  it("gives every profile an (empty, at minimum) entry, even with no eligible candidates", () => {
    const a = loadedProfile({ userId: "a" });
    const results = computeCampusMatches(pool([a]), IntentMode.FRIENDS, EMPTY_IDF);
    expect(results.get("a")).toEqual([]);
  });
});
