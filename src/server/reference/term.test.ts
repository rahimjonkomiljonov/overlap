import { describe, expect, it } from "vitest";
import { currentTerm, TERM_PATTERN } from "./term";

describe("currentTerm", () => {
  it("is the spring term in March–August", () => {
    expect(currentTerm(new Date("2026-03-15T00:00:00Z"))).toBe("2026-1");
    expect(currentTerm(new Date("2026-08-31T10:00:00Z"))).toBe("2026-1"); // 19:00 KST, still Aug 31
  });

  it("is the fall term in September–December", () => {
    expect(currentTerm(new Date("2026-09-24T00:00:00Z"))).toBe("2026-2");
    expect(currentTerm(new Date("2026-12-31T15:00:00Z"))).toBe("2026-2");
  });

  it("is the previous year's fall term in January–February", () => {
    expect(currentTerm(new Date("2027-01-15T00:00:00Z"))).toBe("2026-2");
    expect(currentTerm(new Date("2027-02-28T00:00:00Z"))).toBe("2026-2");
  });

  it("uses Seoul time at the day boundary", () => {
    // 2026-08-31 23:30 UTC = 2026-09-01 08:30 KST, already the fall term.
    expect(currentTerm(new Date("2026-08-31T23:30:00Z"))).toBe("2026-2");
  });
});

describe("TERM_PATTERN", () => {
  it("accepts regular and session terms", () => {
    for (const term of ["2026-1", "2026-2", "2026-S", "2026-W"]) {
      expect(TERM_PATTERN.test(term)).toBe(true);
    }
  });

  it("rejects malformed terms", () => {
    for (const term of ["2026", "26-1", "2026-3", "2026-", "spring-2026"]) {
      expect(TERM_PATTERN.test(term)).toBe(false);
    }
  });
});
