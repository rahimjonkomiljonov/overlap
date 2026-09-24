import { describe, expect, it } from "vitest";
import { calculateProfileStrength, isProfileComplete, type ProfileStrengthInput } from "./strength";

const EMPTY: ProfileStrengthInput = {
  hasBasics: false,
  intentCount: 0,
  courseCount: 0,
  clubCount: 0,
  spotCount: 0,
  freeTimeSlotCount: 0,
  interestCount: 0,
  promptCount: 0,
  valuesAnswerCount: 0,
  photoCount: 0,
};

const COMPLETE: ProfileStrengthInput = {
  hasBasics: true,
  intentCount: 1,
  courseCount: 2,
  clubCount: 1,
  spotCount: 0,
  freeTimeSlotCount: 5,
  interestCount: 4,
  promptCount: 3,
  valuesAnswerCount: 8,
  photoCount: 4,
};

describe("calculateProfileStrength", () => {
  it("is 0 for a brand-new profile", () => {
    expect(calculateProfileStrength(EMPTY)).toBe(0);
  });

  it("is 100 once every slice is earned", () => {
    expect(calculateProfileStrength(COMPLETE)).toBe(100);
  });

  it("credits the optional-overlap slice from any one of courses/clubs/spots/free-time", () => {
    const withOnlySpots = { ...EMPTY, spotCount: 1 };
    const withOnlyFreeTime = { ...EMPTY, freeTimeSlotCount: 1 };
    expect(calculateProfileStrength(withOnlySpots)).toBe(calculateProfileStrength(withOnlyFreeTime));
    expect(calculateProfileStrength(withOnlySpots)).toBeGreaterThan(0);
  });

  it("does not double-count multiple optional-overlap sources", () => {
    const oneSource = { ...EMPTY, courseCount: 1 };
    const allSources = { ...EMPTY, courseCount: 1, clubCount: 1, spotCount: 1, freeTimeSlotCount: 3 };
    expect(calculateProfileStrength(oneSource)).toBe(calculateProfileStrength(allSources));
  });

  it("never exceeds 100 or goes negative for any combination", () => {
    for (let i = 0; i < 64; i++) {
      const input: ProfileStrengthInput = {
        hasBasics: Boolean(i & 1),
        intentCount: i & 2,
        courseCount: i & 4,
        clubCount: 0,
        spotCount: 0,
        freeTimeSlotCount: 0,
        interestCount: i & 8,
        promptCount: i & 16,
        valuesAnswerCount: i & 32 ? 8 : 0,
        photoCount: 0,
      };
      const score = calculateProfileStrength(input);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("isProfileComplete", () => {
  it("is false for a brand-new profile", () => {
    expect(isProfileComplete(EMPTY)).toBe(false);
  });

  it("is true once every required step is done, regardless of optional steps", () => {
    expect(isProfileComplete(COMPLETE)).toBe(true);
    expect(
      isProfileComplete({
        hasBasics: true,
        intentCount: 1,
        valuesAnswerCount: 8,
        promptCount: 3,
        photoCount: 3,
      }),
    ).toBe(true);
  });

  it("is false if any single required step is missing", () => {
    const base = { hasBasics: true, intentCount: 1, valuesAnswerCount: 8, promptCount: 3, photoCount: 3 };
    expect(isProfileComplete({ ...base, hasBasics: false })).toBe(false);
    expect(isProfileComplete({ ...base, intentCount: 0 })).toBe(false);
    expect(isProfileComplete({ ...base, valuesAnswerCount: 7 })).toBe(false);
    expect(isProfileComplete({ ...base, promptCount: 2 })).toBe(false);
    expect(isProfileComplete({ ...base, photoCount: 2 })).toBe(false);
  });

  it("rejects more than the maximum allowed photos", () => {
    expect(
      isProfileComplete({
        hasBasics: true,
        intentCount: 1,
        valuesAnswerCount: 8,
        promptCount: 3,
        photoCount: 7,
      }),
    ).toBe(false);
  });
});
