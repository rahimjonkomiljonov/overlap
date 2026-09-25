import { describe, expect, it } from "vitest";
import { decodeSlotIndex, pairSlotsWithSpots, rankUpcomingSlots } from "./slots";

const MONDAY_NOON_KST = new Date("2026-09-28T03:00:00Z");

describe("decodeSlotIndex", () => {
  it("decodes day and block from a flat index", () => {
    expect(decodeSlotIndex(0)).toEqual({ day: 0, block: 0 });
    expect(decodeSlotIndex(13)).toEqual({ day: 1, block: 1 });
    expect(decodeSlotIndex(83)).toEqual({ day: 6, block: 11 });
  });
});

describe("rankUpcomingSlots", () => {
  it("sorts by soonest chronological occurrence, not by raw slot index", () => {
    // Monday block 5 (already passed -> pushed to next week) vs Tuesday block 0 (later
    // this week) — the lower slot index (Monday) is chronologically *later* here.
    const mondayBlock5 = 0 * 12 + 5;
    const tuesdayBlock0 = 1 * 12 + 0;
    const ranked = rankUpcomingSlots([mondayBlock5, tuesdayBlock0], MONDAY_NOON_KST, 3);
    expect(ranked.map((r) => r.slotIndex)).toEqual([tuesdayBlock0, mondayBlock5]);
  });

  it("caps at the given limit", () => {
    const slots = [0, 12, 24, 36, 48];
    const ranked = rankUpcomingSlots(slots, MONDAY_NOON_KST, 3);
    expect(ranked).toHaveLength(3);
  });

  it("returns an empty array for no shared slots", () => {
    expect(rankUpcomingSlots([], MONDAY_NOON_KST)).toEqual([]);
  });
});

describe("pairSlotsWithSpots", () => {
  const slots = rankUpcomingSlots([0, 12, 24], MONDAY_NOON_KST, 3);

  it("round-robins spots when there are fewer than slots", () => {
    const paired = pairSlotsWithSpots(slots, ["spot-a", "spot-b"]);
    expect(paired.map((p) => p.spotId)).toEqual(["spot-a", "spot-b", "spot-a"]);
  });

  it("returns no options when there are no safe spots", () => {
    expect(pairSlotsWithSpots(slots, [])).toEqual([]);
  });

  it("preserves the slot's own fields alongside the assigned spot", () => {
    const [first] = pairSlotsWithSpots(slots, ["spot-a"]);
    expect(first).toMatchObject({ spotId: "spot-a", slotIndex: slots[0].slotIndex, start: slots[0].start });
  });
});
