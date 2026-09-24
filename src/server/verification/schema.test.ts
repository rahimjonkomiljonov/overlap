import { describe, expect, it } from "vitest";
import { REJECTION_REASON_MAX_LENGTH, reviewSelfieSchema } from "./schema";

describe("reviewSelfieSchema", () => {
  it("accepts an approval with no reason", () => {
    const result = reviewSelfieSchema.safeParse({ selfieId: "s1", decision: "APPROVED" });
    expect(result.success).toBe(true);
  });

  it("accepts an approval with an optional note", () => {
    const result = reviewSelfieSchema.safeParse({ selfieId: "s1", decision: "APPROVED", reason: "matches profile" });
    expect(result.success).toBe(true);
  });

  it("rejects a rejection with no reason", () => {
    const result = reviewSelfieSchema.safeParse({ selfieId: "s1", decision: "REJECTED" });
    expect(result.success).toBe(false);
  });

  it("rejects a rejection with an empty/whitespace-only reason", () => {
    expect(reviewSelfieSchema.safeParse({ selfieId: "s1", decision: "REJECTED", reason: "" }).success).toBe(false);
    expect(reviewSelfieSchema.safeParse({ selfieId: "s1", decision: "REJECTED", reason: "   " }).success).toBe(
      false,
    );
  });

  it("accepts a rejection with a reason", () => {
    const result = reviewSelfieSchema.safeParse({
      selfieId: "s1",
      decision: "REJECTED",
      reason: "Selfie doesn't match profile photos",
    });
    expect(result.success).toBe(true);
  });

  it(`rejects a reason over ${REJECTION_REASON_MAX_LENGTH} characters`, () => {
    const result = reviewSelfieSchema.safeParse({
      selfieId: "s1",
      decision: "REJECTED",
      reason: "a".repeat(REJECTION_REASON_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown decision value", () => {
    const result = reviewSelfieSchema.safeParse({ selfieId: "s1", decision: "MAYBE" });
    expect(result.success).toBe(false);
  });
});
