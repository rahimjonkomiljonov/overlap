import { ReportCategory, ReportPriority } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { isUrgentCategory, priorityForCategory } from "./priority";

describe("priority", () => {
  it("treats non-consensual imagery, deepfakes and illegal filming as urgent", () => {
    expect(isUrgentCategory(ReportCategory.NON_CONSENSUAL_IMAGERY)).toBe(true);
    expect(isUrgentCategory(ReportCategory.DEEPFAKE)).toBe(true);
    expect(isUrgentCategory(ReportCategory.ILLEGAL_FILMING)).toBe(true);
  });

  it("treats every other category as standard", () => {
    const standard = [
      ReportCategory.HARASSMENT,
      ReportCategory.UNWANTED_CONTACT,
      ReportCategory.SCAM_OR_PHISHING,
      ReportCategory.SPAM,
      ReportCategory.FAKE_PROFILE,
      ReportCategory.INAPPROPRIATE_CONTENT,
      ReportCategory.OTHER,
    ];
    for (const category of standard) {
      expect(isUrgentCategory(category)).toBe(false);
    }
  });

  it("maps urgent categories to ReportPriority.URGENT and the rest to STANDARD", () => {
    expect(priorityForCategory(ReportCategory.DEEPFAKE)).toBe(ReportPriority.URGENT);
    expect(priorityForCategory(ReportCategory.SPAM)).toBe(ReportPriority.STANDARD);
  });
});
