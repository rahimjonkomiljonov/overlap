import { describe, expect, it } from "vitest";
import { CUSTOM_DAY_RANGE, customDayStarts, customSlot } from "./custom";

// Wednesday 14 Oct 2026, 10:00 Seoul time (01:00 UTC).
const NOW = new Date("2026-10-14T01:00:00Z");

describe("customDayStarts", () => {
  it("lists Seoul midnights for the next 14 days, starting today", () => {
    const days = customDayStarts(NOW);
    expect(days).toHaveLength(CUSTOM_DAY_RANGE);
    expect(days[0].toISOString()).toBe("2026-10-13T15:00:00.000Z"); // 00:00 on the 14th in Seoul
    expect(days[1].getTime() - days[0].getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("customSlot", () => {
  it("computes the real start and end in Seoul time, and the weekday on the free-time grid", () => {
    // Tomorrow (Thursday = 3), block 7 = 14:00-16:00.
    const slot = customSlot(1, 7, NOW)!;
    expect(slot.start.toISOString()).toBe("2026-10-15T05:00:00.000Z"); // 14:00 Seoul
    expect(slot.end.toISOString()).toBe("2026-10-15T07:00:00.000Z");
    expect(slot.day).toBe(3);
    expect(slot.block).toBe(7);
  });

  it("refuses a start less than an hour away, including blocks already past today", () => {
    expect(customSlot(0, 4, NOW)).toBeNull(); // 08:00 today, already started
    expect(customSlot(0, 5, NOW)).toBeNull(); // 10:00 today, starting now
    expect(customSlot(0, 6, NOW)).not.toBeNull(); // 12:00 today is far enough ahead
  });

  it("refuses night blocks, a negative offset, and anything past 14 days", () => {
    expect(customSlot(1, 2, NOW)).toBeNull(); // 04:00-06:00
    expect(customSlot(1, 11, NOW)).toBeNull(); // 22:00-24:00
    expect(customSlot(-1, 7, NOW)).toBeNull();
    expect(customSlot(CUSTOM_DAY_RANGE, 7, NOW)).toBeNull();
    expect(customSlot(CUSTOM_DAY_RANGE - 1, 7, NOW)).not.toBeNull();
  });

  it("refuses non-integers", () => {
    expect(customSlot(1.5, 7, NOW)).toBeNull();
  });
});
