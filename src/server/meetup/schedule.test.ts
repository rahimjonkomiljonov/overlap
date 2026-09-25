import { describe, expect, it } from "vitest";
import { BLOCK_HOURS, nextSeoulOccurrence, scheduledRangeForSlot } from "./schedule";

// 2026-09-28 is a Monday. 03:00 UTC = 12:00 KST (Seoul is UTC+9).
const MONDAY_NOON_KST = new Date("2026-09-28T03:00:00Z");

describe("nextSeoulOccurrence", () => {
  it("resolves to later today when that block hasn't started yet", () => {
    // Monday, block 7 = 14:00-16:00 KST, still ahead of 12:00 KST "now".
    const result = nextSeoulOccurrence(0, 7, MONDAY_NOON_KST);
    expect(result).toEqual(new Date("2026-09-28T05:00:00Z"));
  });

  it("resolves to next week when today's block already started", () => {
    // Monday, block 5 = 10:00-12:00 KST, already started by 12:00 KST "now".
    const result = nextSeoulOccurrence(0, 5, MONDAY_NOON_KST);
    expect(result).toEqual(new Date("2026-10-05T01:00:00Z"));
  });

  it("resolves to the correct day later this week", () => {
    // Wednesday (day 2), block 0 (00:00-02:00 KST).
    const result = nextSeoulOccurrence(2, 0, MONDAY_NOON_KST);
    expect(result).toEqual(new Date("2026-09-29T15:00:00Z"));
  });

  it("wraps around to next Monday when the target day already passed this week", () => {
    // Sunday (day 6) has already passed relative to Monday noon.
    const result = nextSeoulOccurrence(6, 0, MONDAY_NOON_KST);
    expect(result).toEqual(new Date("2026-10-03T15:00:00Z"));
  });
});

describe("scheduledRangeForSlot", () => {
  it("returns a 2-hour range starting at the next occurrence", () => {
    const { start, end } = scheduledRangeForSlot(0, 7, MONDAY_NOON_KST);
    expect(end.getTime() - start.getTime()).toBe(BLOCK_HOURS * 60 * 60 * 1000);
  });
});
