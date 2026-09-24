import { describe, expect, it } from "vitest";
import { buildExplanations } from "./explain";
import type { MatchTerms } from "./terms";

const WEIGHTS = { wC: 0.45, wK: 0.1, wT: 0.3, wI: 0.1, wV: 0.05 };

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

describe("buildExplanations", () => {
  it("returns nothing shared, nothing to explain", () => {
    expect(buildExplanations(terms(), WEIGHTS)).toEqual([]);
  });

  it("orders explanations by contribution (weight × term value), highest first", () => {
    // wC*C = .45*1 = .45 (highest); wT*T = .3*.5 = .15; wI*I = .1*1 = .1
    const explanations = buildExplanations(
      terms({
        C: 1,
        sharedCourseIds: ["course-1"],
        T: 0.5,
        sharedFreeTimeSlots: [10],
        I: 1,
        sharedInterestTagIds: ["interest-1"],
      }),
      WEIGHTS,
    );
    expect(explanations).toEqual([
      { type: "course", courseId: "course-1" },
      { type: "freeTime", day: 0, block: 10 },
      { type: "interest", interestTagId: "interest-1" },
    ]);
  });

  it("caps at maxCount even when more terms have a positive contribution", () => {
    const explanations = buildExplanations(
      terms({
        C: 1,
        sharedCourseIds: ["c1"],
        K: 1,
        sharedClubIds: ["k1"],
        T: 1,
        sharedFreeTimeSlots: [5],
        I: 1,
        sharedInterestTagIds: ["i1"],
        V: 1,
      }),
      WEIGHTS,
    );
    expect(explanations).toHaveLength(3);
  });

  it("never references an item outside the pair's shared lists", () => {
    const explanations = buildExplanations(
      terms({ C: 1, sharedCourseIds: ["only-this-one"], K: 1, sharedClubIds: ["only-this-club"] }),
      WEIGHTS,
    );
    for (const explanation of explanations) {
      if (explanation.type === "course") expect(explanation.courseId).toBe("only-this-one");
      if (explanation.type === "club") expect(explanation.clubId).toBe("only-this-club");
    }
  });

  it("skips a term with weight×value at 0 even if its raw term value alone is positive elsewhere", () => {
    // K has weight 0.1 but no shared club, so nothing to point to — must not appear.
    const explanations = buildExplanations(terms({ K: 1, sharedClubIds: [] }), WEIGHTS);
    expect(explanations).toEqual([]);
  });

  it("falls back to a generic values explanation when only V contributes", () => {
    const explanations = buildExplanations(terms({ V: 1 }), WEIGHTS);
    expect(explanations).toEqual([{ type: "values" }]);
  });
});
