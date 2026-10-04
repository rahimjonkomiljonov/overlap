import { Gender, IdfFeatureType, IntentMode } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { computeCampusMatches } from "./batch";
import type { CampusMatchPool } from "./candidates";
import { NEUTRAL_SLIDERS } from "./personalize";
import { buildIdfLookup } from "./terms";

type LoadedProfile = CampusMatchPool["profiles"][number];

function loadedProfile(overrides: Partial<LoadedProfile> & { userId: string }): LoadedProfile {
  return {
    gender: Gender.WOMAN,
    interestedIn: null,
    joinedAt: new Date("2020-01-01"),
    courses: [],
    clubIds: [],
    freeTimeSlots: [],
    spotIds: [],
    interestTagIds: [],
    valuesAnswers: [3, 3, 3, 3, 3, 3, 3, 3],
    sliders: NEUTRAL_SLIDERS,
    ...overrides,
  };
}

function pool(profiles: CampusMatchPool["profiles"], overrides: Partial<CampusMatchPool> = {}): CampusMatchPool {
  return { profiles, blockedPairs: new Set(), hiddenBy: new Map(), recentlyShown: new Map(), passedTwice: new Map(), ...overrides };
}

const EMPTY_IDF = buildIdfLookup([]);
const IDF = buildIdfLookup([
  { featureType: IdfFeatureType.COURSE, featureId: "c1", idf: 1 },
  { featureType: IdfFeatureType.INTEREST, featureId: "i1", idf: 1 },
]);

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

  it("never shows a candidate the viewer has passed twice (C8), in that direction only", () => {
    const a = loadedProfile({ userId: "a", clubIds: ["k1"] });
    const b = loadedProfile({ userId: "b", clubIds: ["k1"] });
    const passedTwice = new Map([["a", new Set(["b"])]]);
    const results = computeCampusMatches(pool([a, b], { passedTwice }), IntentMode.FRIENDS, EMPTY_IDF);
    expect(results.get("a")).toEqual([]);
    expect(results.get("b")!.map((r) => r.candidateUserId)).toEqual(["a"]);
  });

  it("each viewer's sliders shift their own ranking (B11)", () => {
    // b shares only a class with the viewer, c only an interest. Opposite values answers
    // keep V at 0 so the C and I terms decide. b and c both lean the same way as the
    // viewer in each case, so the pair's harmonic mean follows the viewer's choice.
    const shared = { courses: [{ courseId: "c1", sectionId: null }], interestTagIds: ["i1"] };
    const low = [1, 1, 1, 1, 1, 1, 1, 1];
    const high = [5, 5, 5, 5, 5, 5, 5, 5];
    const run = (sliders: { classes: number; interests: number; freeTime: number }) => {
      const a = loadedProfile({ userId: "a", ...shared, valuesAnswers: low, sliders });
      const b = loadedProfile({ userId: "b", courses: shared.courses, valuesAnswers: high, sliders });
      const c = loadedProfile({ userId: "c", interestTagIds: shared.interestTagIds, valuesAnswers: high, sliders });
      return computeCampusMatches(pool([a, b, c]), IntentMode.FRIENDS, IDF).get("a")!.map((r) => r.candidateUserId);
    };
    expect(run({ classes: 1.5, interests: 0.5, freeTime: 1 })).toEqual(["b", "c"]);
    expect(run({ classes: 0.5, interests: 1.5, freeTime: 1 })).toEqual(["c", "b"]);
  });

  it("scores a lopsided pair between the two sides' own scores (reciprocity with personal weights)", () => {
    const shared = { courses: [{ courseId: "c1", sectionId: null }] };
    const a = loadedProfile({ userId: "a", ...shared, sliders: { classes: 1.5, interests: 1, freeTime: 1 } });
    const b = loadedProfile({ userId: "b", ...shared, sliders: { classes: 0.5, interests: 1, freeTime: 1 } });
    const neutralA = loadedProfile({ userId: "a", ...shared });
    const neutralB = loadedProfile({ userId: "b", ...shared });
    const scoreOf = (x: LoadedProfile, y: LoadedProfile) =>
      computeCampusMatches(pool([x, y]), IntentMode.FRIENDS, IDF).get("a")![0].score;
    const lopsided = scoreOf(a, b);
    const bothHigh = scoreOf(a, { ...b, sliders: a.sliders });
    const bothLow = scoreOf({ ...a, sliders: b.sliders }, b);
    expect(bothHigh).toBeGreaterThan(bothLow);
    expect(lopsided).toBeLessThan(bothHigh);
    expect(lopsided).toBeGreaterThan(bothLow);
    // Both people see the same pair score.
    expect(computeCampusMatches(pool([a, b]), IntentMode.FRIENDS, IDF).get("b")![0].score).toBeCloseTo(lopsided, 10);
    expect(scoreOf(neutralA, neutralB)).toBeGreaterThan(0);
  });

  it("gives every profile an (empty, at minimum) entry, even with no eligible candidates", () => {
    const a = loadedProfile({ userId: "a" });
    const results = computeCampusMatches(pool([a]), IntentMode.FRIENDS, EMPTY_IDF);
    expect(results.get("a")).toEqual([]);
  });
});
