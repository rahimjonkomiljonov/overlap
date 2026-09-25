import { describe, expect, it } from "vitest";
import { isSeoulQuietHours, seoulCalendarDate, seoulDayRange } from "./seoul-date";

describe("seoulCalendarDate", () => {
  it("returns the Seoul calendar date at UTC midnight", () => {
    // 2026-09-26 15:30 UTC = 2026-09-27 00:30 KST (UTC+9) — already the next day in Seoul.
    const result = seoulCalendarDate(new Date("2026-09-26T15:30:00.000Z"));
    expect(result.toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  it("stays on the same day when it's still the same day in Seoul", () => {
    // 2026-09-26 00:30 UTC = 2026-09-26 09:30 KST.
    const result = seoulCalendarDate(new Date("2026-09-26T00:30:00.000Z"));
    expect(result.toISOString()).toBe("2026-09-26T00:00:00.000Z");
  });
});

describe("seoulDayRange", () => {
  it("spans real Seoul midnight-to-midnight, 9 hours off from the UTC-midnight label", () => {
    // 2026-09-26 15:30 UTC = 2026-09-27 00:30 KST, so "today" in Seoul started at
    // 2026-09-26 15:00:00 UTC (= 2026-09-27 00:00:00 KST) and ends 24h later.
    const { start, end } = seoulDayRange(new Date("2026-09-26T15:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-26T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-27T15:00:00.000Z");
  });

  it("a timestamp just before the boundary falls in the previous range, just after in the next", () => {
    const { start, end } = seoulDayRange(new Date("2026-09-26T15:30:00.000Z"));
    const justBefore = new Date(start.getTime() - 1);
    const justAfter = new Date(start.getTime());
    expect(justBefore.getTime() < start.getTime()).toBe(true);
    expect(justAfter.getTime() >= start.getTime() && justAfter.getTime() < end.getTime()).toBe(true);
  });

  it("is always exactly 24 hours wide", () => {
    const { start, end } = seoulDayRange(new Date("2026-01-15T03:00:00.000Z"));
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("isSeoulQuietHours", () => {
  it("is false in the middle of the day (14:00 KST)", () => {
    expect(isSeoulQuietHours(new Date("2026-09-26T05:00:00.000Z"))).toBe(false);
  });

  it("is false right at the 08:00 KST lower boundary", () => {
    // 08:00 KST = 23:00 UTC the previous day.
    expect(isSeoulQuietHours(new Date("2026-09-25T23:00:00.000Z"))).toBe(false);
  });

  it("is true just before the 08:00 KST lower boundary (07:59 KST)", () => {
    expect(isSeoulQuietHours(new Date("2026-09-25T22:59:00.000Z"))).toBe(true);
  });

  it("is true right at the 21:00 KST upper boundary", () => {
    // 21:00 KST = 12:00 UTC.
    expect(isSeoulQuietHours(new Date("2026-09-26T12:00:00.000Z"))).toBe(true);
  });

  it("is false just before the 21:00 KST upper boundary (20:59 KST)", () => {
    expect(isSeoulQuietHours(new Date("2026-09-26T11:59:00.000Z"))).toBe(false);
  });

  it("is true at Seoul midnight", () => {
    // 00:00 KST = 15:00 UTC the previous day.
    expect(isSeoulQuietHours(new Date("2026-09-25T15:00:00.000Z"))).toBe(true);
  });
});
