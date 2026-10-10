import { describe, expect, it } from "vitest";
import { remainingParts } from "./remaining";

describe("remainingParts", () => {
  it("splits a time left into days, hours and minutes", () => {
    expect(remainingParts((3 * 24 * 60 + 4 * 60 + 5) * 60_000)).toEqual({ days: 3, hours: 4, minutes: 5 });
    expect(remainingParts(90 * 60_000)).toEqual({ days: 0, hours: 1, minutes: 30 });
  });

  it("never goes negative once a suspension has passed", () => {
    expect(remainingParts(-5_000)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
