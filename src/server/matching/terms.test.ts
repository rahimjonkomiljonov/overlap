import { IdfFeatureType } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { buildIdfLookup, computeMatchTerms, type MatchableProfile } from "./terms";

function profile(overrides: Partial<MatchableProfile> & { userId: string }): MatchableProfile {
  return {
    courses: [],
    clubIds: [],
    freeTimeSlots: [],
    spotIds: [],
    interestTagIds: [],
    valuesAnswers: [3, 3, 3, 3, 3, 3, 3, 3],
    ...overrides,
  };
}

const EMPTY_IDF = buildIdfLookup([]);

function randomProfile(userId: string, seed: number): MatchableProfile {
  // Deterministic pseudo-random content so property tests are reproducible.
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const courseCount = Math.floor(rand() * 3);
  const courses = Array.from({ length: courseCount }, (_, i) => ({
    courseId: `course-${Math.floor(rand() * 5)}`,
    sectionId: rand() > 0.5 ? `section-${i}` : null,
  }));
  return profile({
    userId,
    courses,
    clubIds: Array.from({ length: Math.floor(rand() * 3) }, () => `club-${Math.floor(rand() * 5)}`),
    interestTagIds: Array.from({ length: Math.floor(rand() * 6) }, () => `interest-${Math.floor(rand() * 10)}`),
    freeTimeSlots: Array.from({ length: Math.floor(rand() * 10) }, () => Math.floor(rand() * 84)),
    spotIds: Array.from({ length: Math.floor(rand() * 3) }, () => `spot-${Math.floor(rand() * 4)}`),
    valuesAnswers: Array.from({ length: 8 }, () => 1 + Math.floor(rand() * 5)),
  });
}

describe("computeMatchTerms: symmetry (S10 Done-when)", () => {
  it("gives identical term values regardless of argument order, across many random pairs", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = randomProfile("a", seed);
      const b = randomProfile("b", seed + 1000);
      const ab = computeMatchTerms(a, b, EMPTY_IDF);
      const ba = computeMatchTerms(b, a, EMPTY_IDF);
      expect(ba.C).toBeCloseTo(ab.C, 10);
      expect(ba.K).toBeCloseTo(ab.K, 10);
      expect(ba.T).toBeCloseTo(ab.T, 10);
      expect(ba.I).toBeCloseTo(ab.I, 10);
      expect(ba.V).toBeCloseTo(ab.V, 10);
      // Shared-item lists are the same *set*, independent of which side's array was iterated.
      expect(new Set(ba.sharedCourseIds)).toEqual(new Set(ab.sharedCourseIds));
      expect(new Set(ba.sharedClubIds)).toEqual(new Set(ab.sharedClubIds));
      expect(new Set(ba.sharedInterestTagIds)).toEqual(new Set(ab.sharedInterestTagIds));
    }
  });

  it("every term stays within [0, 1] across many random pairs", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = randomProfile("a", seed * 7 + 1);
      const b = randomProfile("b", seed * 13 + 2);
      const terms = computeMatchTerms(a, b, EMPTY_IDF);
      for (const key of ["C", "K", "T", "I", "V"] as const) {
        expect(terms[key]).toBeGreaterThanOrEqual(0);
        expect(terms[key]).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("computeMatchTerms: IDF monotonicity", () => {
  it("a rarer shared course contributes more to C than a common one, all else equal", () => {
    const idf = buildIdfLookup([
      { featureType: IdfFeatureType.COURSE, featureId: "rare", idf: 3 },
      { featureType: IdfFeatureType.COURSE, featureId: "common", idf: 0.1 },
      // Both sides' "noise" course needs its own nonzero weight too, or it wouldn't
      // dilute the denominator at all (a missing stat defaults to idf=0) and both
      // scenarios would trivially clamp to C=1 regardless of "rare" vs "common".
      { featureType: IdfFeatureType.COURSE, featureId: "other-a", idf: 1 },
      { featureType: IdfFeatureType.COURSE, featureId: "other-b", idf: 1 },
    ]);
    const rareShared = computeMatchTerms(
      profile({ userId: "a", courses: [{ courseId: "rare", sectionId: null }] }),
      profile({ userId: "b", courses: [{ courseId: "rare", sectionId: null }] }),
      idf,
    );
    const commonShared = computeMatchTerms(
      profile({ userId: "a", courses: [{ courseId: "common", sectionId: null }] }),
      profile({ userId: "b", courses: [{ courseId: "common", sectionId: null }] }),
      idf,
    );
    // Both are the *only* course either side has, so both are a "full overlap" (C=1) —
    // IDF only matters once there's a competing, non-shared course diluting the union.
    const rareWithNoise = computeMatchTerms(
      profile({
        userId: "a",
        courses: [
          { courseId: "rare", sectionId: null },
          { courseId: "other-a", sectionId: null },
        ],
      }),
      profile({
        userId: "b",
        courses: [
          { courseId: "rare", sectionId: null },
          { courseId: "other-b", sectionId: null },
        ],
      }),
      idf,
    );
    const commonWithNoise = computeMatchTerms(
      profile({
        userId: "a",
        courses: [
          { courseId: "common", sectionId: null },
          { courseId: "other-a", sectionId: null },
        ],
      }),
      profile({
        userId: "b",
        courses: [
          { courseId: "common", sectionId: null },
          { courseId: "other-b", sectionId: null },
        ],
      }),
      idf,
    );
    expect(rareShared.C).toBe(1);
    expect(commonShared.C).toBe(1);
    expect(rareWithNoise.C).toBeGreaterThan(commonWithNoise.C);
  });

  it("the same-section bonus increases C for an otherwise identical pair", () => {
    // Extra non-shared courses on "a" keep the union well above the shared course's own
    // weight, so C stays below 1 and the 1.25x bonus has headroom to actually show up
    // rather than being clamped away.
    const idf = buildIdfLookup([
      { featureType: IdfFeatureType.COURSE, featureId: "c1", idf: 1 },
      { featureType: IdfFeatureType.COURSE, featureId: "c2", idf: 1 },
      { featureType: IdfFeatureType.COURSE, featureId: "c3", idf: 1 },
      { featureType: IdfFeatureType.COURSE, featureId: "c4", idf: 1 },
    ]);
    const aCourses = [
      { courseId: "c1", sectionId: "01" },
      { courseId: "c2", sectionId: null },
      { courseId: "c3", sectionId: null },
      { courseId: "c4", sectionId: null },
    ];
    const withoutBonus = computeMatchTerms(
      profile({ userId: "a", courses: aCourses }),
      profile({ userId: "b", courses: [{ courseId: "c1", sectionId: "02" }] }),
      idf,
    );
    const withBonus = computeMatchTerms(
      profile({ userId: "a", courses: aCourses }),
      profile({ userId: "b", courses: [{ courseId: "c1", sectionId: "01" }] }),
      idf,
    );
    expect(withBonus.C).toBeGreaterThan(withoutBonus.C);
    expect(withBonus.sameSectionCourseIds).toEqual(["c1"]);
  });
});

describe("computeMatchTerms: never exposes a non-shared item", () => {
  it("sharedCourseIds/sharedClubIds/sharedInterestTagIds only ever contain items both sides actually have", () => {
    const a = profile({
      userId: "a",
      courses: [{ courseId: "c1", sectionId: null }],
      clubIds: ["k1"],
      interestTagIds: ["i1", "i2"],
    });
    const b = profile({
      userId: "b",
      courses: [{ courseId: "c1", sectionId: null }, { courseId: "c-only-b", sectionId: null }],
      clubIds: ["k1", "k-only-b"],
      interestTagIds: ["i2", "i-only-b"],
    });
    const terms = computeMatchTerms(a, b, EMPTY_IDF);
    expect(terms.sharedCourseIds).toEqual(["c1"]);
    expect(terms.sharedClubIds).toEqual(["k1"]);
    expect(terms.sharedInterestTagIds).toEqual(["i2"]);
    for (const id of [...terms.sharedCourseIds, ...terms.sharedClubIds, ...terms.sharedInterestTagIds]) {
      expect(id).not.toMatch(/only-b/);
    }
  });
});

describe("computeMatchTerms: values (V)", () => {
  it("identical values-quiz answers score V=1", () => {
    const a = profile({ userId: "a", valuesAnswers: [1, 2, 3, 4, 5, 1, 2, 3] });
    const b = profile({ userId: "b", valuesAnswers: [1, 2, 3, 4, 5, 1, 2, 3] });
    expect(computeMatchTerms(a, b, EMPTY_IDF).V).toBe(1);
  });

  it("maximally opposite values-quiz answers score V=0", () => {
    const a = profile({ userId: "a", valuesAnswers: [1, 1, 1, 1, 1, 1, 1, 1] });
    const b = profile({ userId: "b", valuesAnswers: [5, 5, 5, 5, 5, 5, 5, 5] });
    expect(computeMatchTerms(a, b, EMPTY_IDF).V).toBe(0);
  });
});
