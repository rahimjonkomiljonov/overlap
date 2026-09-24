import { describe, expect, it } from "vitest";
import { seoulCalendarDate, seoulDayRange } from "./seoul-date";

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
