import { describe, expect, it } from "vitest";
import { MIN_SHAREABLE_COUNT, shareBucket } from "./buckets";

describe("shareBucket", () => {
  it("has no card below the minimum", () => {
    for (const n of [0, 1, 2, 3, 4, Number.NaN, -1]) expect(shareBucket(n)).toBeNull();
    expect(MIN_SHAREABLE_COUNT).toBe(5);
  });

  it("floors to a coarse bucket and never returns more than the real count", () => {
    const cases: [number, number][] = [
      [5, 5],
      [9, 5],
      [10, 10],
      [19, 10],
      [20, 20],
      [49, 20],
      [50, 50],
      [99, 50],
      [100, 100],
      [2500, 100],
    ];
    for (const [count, bucket] of cases) {
      expect(shareBucket(count)).toBe(bucket);
      expect(shareBucket(count)!).toBeLessThanOrEqual(count);
    }
  });
});
