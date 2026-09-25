import { ReportPriority } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { isOverdue, slaDeadline } from "./sla";

const CREATED_AT = new Date("2026-09-25T00:00:00Z");

describe("slaDeadline", () => {
  it("is 2 hours out for urgent reports", () => {
    expect(slaDeadline(ReportPriority.URGENT, CREATED_AT)).toEqual(new Date("2026-09-25T02:00:00Z"));
  });

  it("is 24 hours out for standard reports", () => {
    expect(slaDeadline(ReportPriority.STANDARD, CREATED_AT)).toEqual(new Date("2026-09-26T00:00:00Z"));
  });
});

describe("isOverdue", () => {
  it("is not overdue before the deadline", () => {
    expect(isOverdue(ReportPriority.URGENT, CREATED_AT, new Date("2026-09-25T01:59:59Z"))).toBe(false);
  });

  it("is overdue exactly at and after the deadline", () => {
    expect(isOverdue(ReportPriority.URGENT, CREATED_AT, new Date("2026-09-25T02:00:00Z"))).toBe(true);
    expect(isOverdue(ReportPriority.URGENT, CREATED_AT, new Date("2026-09-25T03:00:00Z"))).toBe(true);
  });

  it("standard reports get the full 24h window", () => {
    expect(isOverdue(ReportPriority.STANDARD, CREATED_AT, new Date("2026-09-25T23:00:00Z"))).toBe(false);
    expect(isOverdue(ReportPriority.STANDARD, CREATED_AT, new Date("2026-09-26T00:00:00Z"))).toBe(true);
  });
});
