import { ReportCategory } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { appealSchema, fileReportSchema, moderationActionSchema } from "./schema";

describe("fileReportSchema", () => {
  it("accepts a minimal report (category + target only)", () => {
    const result = fileReportSchema.safeParse({ targetUserId: "u1", category: ReportCategory.SPAM });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown category", () => {
    const result = fileReportSchema.safeParse({ targetUserId: "u1", category: "NOT_A_CATEGORY" });
    expect(result.success).toBe(false);
  });

  it("rejects a description over 500 characters", () => {
    const result = fileReportSchema.safeParse({
      targetUserId: "u1",
      category: ReportCategory.SPAM,
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("trims description whitespace", () => {
    const result = fileReportSchema.safeParse({
      targetUserId: "u1",
      category: ReportCategory.SPAM,
      description: "  hi  ",
    });
    expect(result.success && result.data.description).toBe("hi");
  });
});

describe("moderationActionSchema", () => {
  it("requires a non-empty reason", () => {
    expect(
      moderationActionSchema.safeParse({ reportId: "r1", type: "WARN", reason: "" }).success,
    ).toBe(false);
    expect(
      moderationActionSchema.safeParse({ reportId: "r1", type: "WARN", reason: "  " }).success,
    ).toBe(false);
  });

  it("accepts a valid action with a reason", () => {
    expect(
      moderationActionSchema.safeParse({ reportId: "r1", type: "BAN", reason: "confirmed" }).success,
    ).toBe(true);
  });
});

describe("appealSchema", () => {
  it("requires a non-empty appeal note", () => {
    expect(appealSchema.safeParse({ moderationActionId: "a1", appealNote: "" }).success).toBe(false);
  });

  it("accepts a valid appeal", () => {
    expect(appealSchema.safeParse({ moderationActionId: "a1", appealNote: "it wasn't me" }).success).toBe(true);
  });
});
