import { describe, expect, it } from "vitest";
import { reciprocityScore, scoreFromTerms } from "./score";
import type { MatchTerms } from "./terms";

function terms(overrides: Partial<MatchTerms> = {}): MatchTerms {
  return {
    C: 0,
    K: 0,
    T: 0,
    I: 0,
    V: 0,
    sharedCourseIds: [],
    sameSectionCourseIds: [],
    sharedClubIds: [],
    sharedInterestTagIds: [],
    sharedSpotIds: [],
    sharedFreeTimeSlots: [],
    ...overrides,
  };
}

describe("scoreFromTerms", () => {
  it("all terms at 1 with weights summing to 1 scores exactly 100", () => {
    const weights = { wC: 0.2, wK: 0.2, wT: 0.2, wI: 0.2, wV: 0.2 };
    expect(scoreFromTerms(terms({ C: 1, K: 1, T: 1, I: 1, V: 1 }), weights)).toBe(100);
  });

  it("all terms at 0 scores exactly 0", () => {
    const weights = { wC: 0.45, wK: 0.1, wT: 0.3, wI: 0.1, wV: 0.05 };
    expect(scoreFromTerms(terms(), weights)).toBe(0);
  });

  it("weights the terms proportionally", () => {
    const weights = { wC: 0.45, wK: 0.1, wT: 0.3, wI: 0.1, wV: 0.05 };
    const courseHeavy = scoreFromTerms(terms({ C: 1 }), weights);
    const clubHeavy = scoreFromTerms(terms({ K: 1 }), weights);
    expect(courseHeavy).toBeGreaterThan(clubHeavy);
    expect(courseHeavy).toBeCloseTo(45, 10);
    expect(clubHeavy).toBeCloseTo(10, 10);
  });
});

describe("reciprocityScore (harmonic mean)", () => {
  it("returns the shared value when both directions agree", () => {
    expect(reciprocityScore(80, 80)).toBeCloseTo(80, 10);
  });

  it("matches the textbook harmonic-mean formula", () => {
    expect(reciprocityScore(40, 60)).toBeCloseTo((2 * 40 * 60) / (40 + 60), 10);
  });

  it("is 0 whenever either side is 0", () => {
    expect(reciprocityScore(0, 90)).toBe(0);
    expect(reciprocityScore(90, 0)).toBe(0);
    expect(reciprocityScore(0, 0)).toBe(0);
  });

  it("punishes a lopsided pair more harshly than an arithmetic mean would", () => {
    const harmonic = reciprocityScore(100, 4);
    const arithmetic = (100 + 4) / 2;
    expect(harmonic).toBeLessThan(arithmetic);
    // Close to the smaller value, not the midpoint — this is the whole point of using
    // harmonic mean for reciprocity (§5.2): a match that's great for one side and bad
    // for the other should rank near "bad", not "medium".
    expect(harmonic).toBeLessThan(10);
  });

  it("is symmetric in its two arguments", () => {
    expect(reciprocityScore(37, 82)).toBeCloseTo(reciprocityScore(82, 37), 10);
  });
});
