import { describe, expect, it } from "vitest";
import type { RankedCandidate } from "./batch";
import { composeBatch, DAILY_EXPOSURE_CAP } from "./compose";

const NOW = new Date("2026-09-26T00:00:00Z");
const OLD_JOINED_AT = new Date("2020-01-01"); // definitely not a newcomer

function ranked(count: number, scoreFn: (i: number) => number = (i) => 100 - i): RankedCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    candidateUserId: `c${i}`,
    score: scoreFn(i),
    reasons: [],
  }));
}

function context(overrides: Partial<Parameters<typeof composeBatch>[1]> = {}) {
  return {
    joinedAtByUserId: new Map<string, Date>(),
    now: NOW,
    exposureCounts: new Map<string, number>(),
    ...overrides,
  };
}

describe("composeBatch", () => {
  it("picks the 4 top-ranked candidates first", () => {
    const result = composeBatch(ranked(60), context());
    expect(result.items.slice(0, 4).map((i) => i.candidateUserId)).toEqual(["c0", "c1", "c2", "c3"]);
  });

  it("picks the best-ranked candidate within [20,50] (1-indexed) as the adjacent slot", () => {
    const result = composeBatch(ranked(60), context());
    // rank 20 (1-indexed) is index 19 ("c19").
    const adjacent = result.items[4];
    expect(adjacent.candidateUserId).toBe("c19");
  });

  it("picks the best-ranked recent joiner as the newcomer slot", () => {
    const joinedAtByUserId = new Map([
      ["c55", NOW], // joined today
      ["c58", NOW],
    ]);
    const result = composeBatch(ranked(60), context({ joinedAtByUserId }));
    const newcomer = result.items[5];
    // c55 outranks c58 (lower index = higher score), and neither is in top4/adjacent.
    expect(newcomer.candidateUserId).toBe("c55");
  });

  it("never double-counts a candidate across slots", () => {
    // c19 (the adjacent pick) is also the only "newcomer" — must not be picked twice.
    const joinedAtByUserId = new Map([["c19", NOW]]);
    const result = composeBatch(ranked(60), context({ joinedAtByUserId }));
    const ids = result.items.map((i) => i.candidateUserId);
    expect(new Set(ids).size).toBe(ids.length);
    // With no other newcomer available, the batch is 5 items, not a duplicated 6th.
    expect(result.items).toHaveLength(5);
  });

  it("produces fewer than 6 items (low density) rather than padding with anything fake when the pool is thin", () => {
    const result = composeBatch(ranked(2), context());
    expect(result.items).toHaveLength(2);
    expect(result.lowDensity).toBe(true);
    expect(result.items.map((i) => i.candidateUserId)).toEqual(["c0", "c1"]);
  });

  it("is not low-density once a full 6-item batch is composed", () => {
    const joinedAtByUserId = new Map([["c25", NOW]]);
    const result = composeBatch(ranked(60), context({ joinedAtByUserId }));
    expect(result.items).toHaveLength(6);
    expect(result.lowDensity).toBe(false);
  });

  it("never selects a candidate past the exposure cap, and skips to the next-best instead", () => {
    const exposureCounts = new Map([["c0", DAILY_EXPOSURE_CAP]]);
    const result = composeBatch(ranked(60), context({ exposureCounts }));
    const ids = result.items.map((i) => i.candidateUserId);
    expect(ids).not.toContain("c0");
    // c1..c4 fill the top-4 slots instead.
    expect(ids.slice(0, 4)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("increments exposureCounts for everyone actually selected, and only once each", () => {
    const exposureCounts = new Map<string, number>();
    composeBatch(ranked(60), context({ exposureCounts }));
    expect(exposureCounts.get("c0")).toBe(1);
    expect(exposureCounts.get("c19")).toBe(1); // adjacent pick
  });

  it("threading the same exposureCounts across multiple composeBatch calls enforces the cap across users", () => {
    const exposureCounts = new Map<string, number>();
    const pool = ranked(60);
    // Simulate DAILY_EXPOSURE_CAP separate viewers, all with the exact same ranking —
    // c0 would be picked by every single one without the cap.
    for (let viewer = 0; viewer < DAILY_EXPOSURE_CAP + 5; viewer++) {
      composeBatch(pool, context({ exposureCounts }));
    }
    expect(exposureCounts.get("c0")).toBe(DAILY_EXPOSURE_CAP);
  });

  it("assigns sequential rank 1..N to the final selection, in the order chosen", () => {
    const result = composeBatch(ranked(60), context());
    expect(result.items.map((i) => i.rank)).toEqual(result.items.map((_, i) => i + 1));
  });

  it("ignores a candidate whose join date is outside the newcomer window", () => {
    const joinedAtByUserId = new Map([["c25", OLD_JOINED_AT]]);
    const result = composeBatch(ranked(60), context({ joinedAtByUserId }));
    // No eligible newcomer, so only top4 + adjacent = 5 items.
    expect(result.items).toHaveLength(5);
  });

  it("handles an empty ranking gracefully", () => {
    const result = composeBatch([], context());
    expect(result.items).toEqual([]);
    expect(result.lowDensity).toBe(true);
  });
});
