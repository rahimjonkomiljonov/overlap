import { describe, expect, it } from "vitest";
import { seoulCalendarDate } from "./seoul-date";

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
