import { describe, expect, it } from "vitest";
import { planSyntheticCampus, type SyntheticReferenceData } from "./plan";

const REFERENCE: SyntheticReferenceData = {
  courseIds: Array.from({ length: 8 }, (_, i) => `course-${i}`),
  clubIds: Array.from({ length: 8 }, (_, i) => `club-${i}`),
  interestTagIds: Array.from({ length: 25 }, (_, i) => `interest-${i}`),
  promptIds: Array.from({ length: 8 }, (_, i) => `prompt-${i}`),
};

const BASE_OPTIONS = { campusId: "campus-1", seed: 42, userCount: 100, communityCount: 5, currentYear: 2026 };

describe("planSyntheticCampus", () => {
  it("is deterministic: the same seed and reference data produce byte-identical output", () => {
    const a = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    const b = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    expect(a).toEqual(b);
  });

  it("produces a different plan for a different seed", () => {
    const a = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    const b = planSyntheticCampus({ ...BASE_OPTIONS, seed: 43 }, REFERENCE);
    // Which sequential user index lands in which community is fixed by userCount/
    // communityCount alone, not the seed — it's *what each community is planted with*
    // (courses/clubs/values) that the seed governs, so that's what should diverge.
    expect(a.users.map((u) => u.courseIds)).not.toEqual(b.users.map((u) => u.courseIds));
    expect(a.users.map((u) => u.valuesAnswers)).not.toEqual(b.users.map((u) => u.valuesAnswers));
  });

  it("creates exactly userCount users, distributed across communityCount communities", () => {
    const plan = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    expect(plan.users).toHaveLength(100);
    const communityIndices = new Set(plan.users.map((u) => u.communityIndex));
    expect(communityIndices.size).toBe(5);
    for (const index of communityIndices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
    }
  });

  it("gives every member of a community the exact same planted courses and clubs", () => {
    const plan = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    const byCommunity = new Map<number, (typeof plan.users)[number][]>();
    for (const user of plan.users) {
      const list = byCommunity.get(user.communityIndex) ?? [];
      list.push(user);
      byCommunity.set(user.communityIndex, list);
    }
    for (const members of byCommunity.values()) {
      const first = members[0];
      for (const member of members) {
        expect(member.courseIds).toEqual(first.courseIds);
        expect(member.clubIds).toEqual(first.clubIds);
      }
    }
  });

  it("jitters values-quiz answers and free-time slots within a community rather than cloning them exactly", () => {
    const plan = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    const community0 = plan.users.filter((u) => u.communityIndex === 0);
    const distinctValuesAnswers = new Set(community0.map((u) => u.valuesAnswers.join(",")));
    // With ~20 members and independent jitter per person, cloning everyone identically would be implausible.
    expect(distinctValuesAnswers.size).toBeGreaterThan(1);
  });

  it("keeps every valuesAnswers entry within the 1-5 Likert range", () => {
    const plan = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    for (const user of plan.users) {
      for (const answer of user.valuesAnswers) {
        expect(answer).toBeGreaterThanOrEqual(1);
        expect(answer).toBeLessThanOrEqual(5);
      }
    }
  });

  it("never produces an email collision", () => {
    const plan = planSyntheticCampus(BASE_OPTIONS, REFERENCE);
    expect(new Set(plan.users.map((u) => u.email)).size).toBe(plan.users.length);
  });

  it("clamps communityCount to at most userCount", () => {
    const plan = planSyntheticCampus({ ...BASE_OPTIONS, userCount: 3, communityCount: 10 }, REFERENCE);
    expect(plan.users).toHaveLength(3);
    expect(new Set(plan.users.map((u) => u.communityIndex)).size).toBeLessThanOrEqual(3);
  });

  it("throws with no courses or clubs to plant communities around", () => {
    expect(() => planSyntheticCampus(BASE_OPTIONS, { ...REFERENCE, courseIds: [] })).toThrow(/courses/);
    expect(() => planSyntheticCampus(BASE_OPTIONS, { ...REFERENCE, clubIds: [] })).toThrow(/courses/);
  });

  it("throws with no interest tags or prompts available", () => {
    expect(() => planSyntheticCampus(BASE_OPTIONS, { ...REFERENCE, interestTagIds: [] })).toThrow(/interest/);
    expect(() => planSyntheticCampus(BASE_OPTIONS, { ...REFERENCE, promptIds: [] })).toThrow(/interest/);
  });
});
