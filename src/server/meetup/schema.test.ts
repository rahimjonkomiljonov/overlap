import { describe, expect, it } from "vitest";
import {
  cancelMeetupSchema,
  createShareLinkSchema,
  proposeMeetupSchema,
  respondToMeetupSchema,
  revokeShareLinkSchema,
  submitMeetupFeedbackSchema,
} from "./schema";

describe("proposeMeetupSchema", () => {
  it("coerces day/block from form-data strings", () => {
    const result = proposeMeetupSchema.safeParse({ matchId: "m1", spotId: "s1", day: "3", block: "7" });
    expect(result.success && result.data.day).toBe(3);
    expect(result.success && result.data.block).toBe(7);
  });

  it("rejects an out-of-range day or block", () => {
    expect(proposeMeetupSchema.safeParse({ matchId: "m1", spotId: "s1", day: "7", block: "0" }).success).toBe(false);
    expect(proposeMeetupSchema.safeParse({ matchId: "m1", spotId: "s1", day: "0", block: "12" }).success).toBe(false);
    expect(proposeMeetupSchema.safeParse({ matchId: "m1", spotId: "s1", day: "-1", block: "0" }).success).toBe(false);
  });
});

describe("respondToMeetupSchema", () => {
  it("only accepts ACCEPT or DECLINE", () => {
    expect(respondToMeetupSchema.safeParse({ proposalId: "p1", decision: "ACCEPT" }).success).toBe(true);
    expect(respondToMeetupSchema.safeParse({ proposalId: "p1", decision: "DECLINE" }).success).toBe(true);
    expect(respondToMeetupSchema.safeParse({ proposalId: "p1", decision: "MAYBE" }).success).toBe(false);
  });
});

describe("submitMeetupFeedbackSchema", () => {
  it("only accepts the four defined feedback responses", () => {
    for (const response of ["GREAT", "FINE", "NOT_FOR_ME", "UNCOMFORTABLE"]) {
      expect(submitMeetupFeedbackSchema.safeParse({ proposalId: "p1", response }).success).toBe(true);
    }
    expect(submitMeetupFeedbackSchema.safeParse({ proposalId: "p1", response: "BAD" }).success).toBe(false);
  });
});

describe("id-only schemas", () => {
  it("require a non-empty id", () => {
    expect(cancelMeetupSchema.safeParse({ proposalId: "" }).success).toBe(false);
    expect(createShareLinkSchema.safeParse({ proposalId: "" }).success).toBe(false);
    expect(revokeShareLinkSchema.safeParse({ linkId: "" }).success).toBe(false);
  });
});
