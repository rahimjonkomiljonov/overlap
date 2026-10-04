import { describe, expect, it } from "vitest";
import { setWeightSlidersSchema } from "./schema";

describe("setWeightSlidersSchema", () => {
  it("accepts the five slider stops as form strings", () => {
    for (const v of ["0.5", "0.75", "1", "1.25", "1.5"]) {
      expect(setWeightSlidersSchema.safeParse({ classes: v, interests: v, freeTime: v }).success).toBe(true);
    }
  });

  it("rejects values outside 0.5-1.5, off-step values and junk", () => {
    for (const v of ["0.25", "1.75", "1.1", "abc", ""]) {
      expect(setWeightSlidersSchema.safeParse({ classes: v, interests: "1", freeTime: "1" }).success).toBe(false);
    }
  });
});
