import { describe, expect, it } from "vitest";
import {
  NO_SIGNALS,
  REACH_LIMIT_THRESHOLD,
  computeTrustScore,
  explainTrust,
  isReachLimited,
} from "./score";

const NOW = new Date("2026-10-05T00:00:00Z");

describe("computeTrustScore", () => {
  it("is 100 with no signals and never leaves 0-100", () => {
    expect(computeTrustScore(NO_SIGNALS)).toBe(100);
    expect(computeTrustScore({ reporters: 50, warnings: 50, uncomfortableMeetups: 50 })).toBe(0);
  });

  it("one or two reports alone never limit reach; a third distinct reporter does", () => {
    const at = (reporters: number) => computeTrustScore({ ...NO_SIGNALS, reporters });
    expect(isReachLimited(at(1), null, NOW)).toBe(false);
    expect(isReachLimited(at(2), null, NOW)).toBe(false);
    expect(isReachLimited(at(3), null, NOW)).toBe(true);
  });

  it("is monotonic: more signals never raise the score", () => {
    const base = { reporters: 1, warnings: 1, uncomfortableMeetups: 1 };
    const score = computeTrustScore(base);
    expect(computeTrustScore({ ...base, reporters: 2 })).toBeLessThan(score);
    expect(computeTrustScore({ ...base, warnings: 2 })).toBeLessThan(score);
    expect(computeTrustScore({ ...base, uncomfortableMeetups: 2 })).toBeLessThan(score);
  });
});

describe("isReachLimited", () => {
  it("is lifted while an accepted appeal's restore window lasts", () => {
    const low = REACH_LIMIT_THRESHOLD - 10;
    expect(isReachLimited(low, null, NOW)).toBe(true);
    expect(isReachLimited(low, new Date("2026-12-01"), NOW)).toBe(false);
    expect(isReachLimited(low, new Date("2026-09-01"), NOW)).toBe(true);
  });
});

describe("explainTrust", () => {
  it("lists only the signals that cost points, as counts", () => {
    expect(explainTrust({ reporters: 3, warnings: 0, uncomfortableMeetups: 1 })).toEqual([
      { type: "reporters", count: 3 },
      { type: "uncomfortableMeetups", count: 1 },
    ]);
    expect(explainTrust(NO_SIGNALS)).toEqual([]);
  });
});
