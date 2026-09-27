import { ReportPriority, ReportStatus } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import {
  getCandidateDensity,
  getFunnelCounts,
  getReportSlaSnapshot,
  summarizeReportSla,
  type DensityDb,
  type FunnelDb,
  type ReportSlaDb,
} from "./metrics";

describe("getFunnelCounts", () => {
  it("counts each funnel step, deduping match/meetup rows across two user-id columns", async () => {
    const db = {
      user: {
        count: async (args?: { where?: { verifiedAt?: unknown } }) =>
          args?.where?.verifiedAt ? 3 : 5,
      },
      profile: { count: async () => 2 },
      wave: { findMany: async () => [{ fromUserId: "u1" }, { fromUserId: "u2" }] },
      match: {
        findMany: async () => [
          { userAId: "u1", userBId: "u2" },
          { userAId: "u2", userBId: "u3" },
        ],
      },
      message: { findMany: async () => [{ senderId: "u1" }] },
      meetProposal: {
        findMany: async () => [
          { proposedByUserId: "u1", respondedByUserId: "u2" },
          { proposedByUserId: "u3", respondedByUserId: null },
        ],
      },
    } as unknown as FunnelDb;

    const funnel = await getFunnelCounts(db);
    expect(funnel).toEqual({
      signups: 5,
      verified: 3,
      profileComplete: 2,
      sentFirstWave: 2,
      matched: 3, // u1, u2, u3 — distinct across both columns
      messaged: 1,
      meetupAccepted: 3, // u1, u2, u3 — distinct across proposer + responder
    });
  });
});

describe("getCandidateDensity", () => {
  it("reports no data when no daily batch has ever run", async () => {
    const db = { dailyBatch: { findFirst: async () => null } } as unknown as DensityDb;
    expect(await getCandidateDensity(db)).toEqual({
      batchDate: null,
      batchCount: 0,
      averageItemsPerBatch: 0,
      fullBatchPct: null,
    });
  });

  it("averages items per batch and the full-batch rate for the most recent batch date", async () => {
    const batchDate = new Date("2026-09-27T00:00:00Z");
    const db = {
      dailyBatch: {
        findFirst: async () => ({ batchDate }),
        findMany: async () => [
          { items: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `a${i}` })) }, // full batch (6)
          { items: [1, 2, 3].map((i) => ({ id: `b${i}` })) }, // low-density fallback (3)
        ],
      },
    } as unknown as DensityDb;

    const density = await getCandidateDensity(db);
    expect(density.batchDate).toEqual(batchDate);
    expect(density.batchCount).toBe(2);
    expect(density.averageItemsPerBatch).toBe(4.5);
    expect(density.fullBatchPct).toBe(0.5);
  });
});

describe("summarizeReportSla", () => {
  const now = new Date("2026-09-27T12:00:00Z");

  it("computes median resolution time and within-SLA rate for resolved reports only", () => {
    const reports = [
      {
        priority: ReportPriority.URGENT,
        status: ReportStatus.RESOLVED,
        createdAt: new Date("2026-09-27T00:00:00Z"),
        resolvedAt: new Date("2026-09-27T01:00:00Z"), // 1h, within the 2h urgent SLA
      },
      {
        priority: ReportPriority.URGENT,
        status: ReportStatus.RESOLVED,
        createdAt: new Date("2026-09-27T00:00:00Z"),
        resolvedAt: new Date("2026-09-27T05:00:00Z"), // 5h, breached the 2h urgent SLA
      },
      {
        priority: ReportPriority.STANDARD,
        status: ReportStatus.OPEN,
        createdAt: new Date("2026-09-26T00:00:00Z"), // > 24h old and still open: overdue
        resolvedAt: null,
      },
    ];

    const snapshot = summarizeReportSla(reports, now);
    expect(snapshot.totalReports).toBe(3);
    expect(snapshot.openCount).toBe(1);
    expect(snapshot.openOverdueCount).toBe(1);
    expect(snapshot.resolvedCount).toBe(2);
    expect(snapshot.resolvedWithinSlaCount).toBe(1);
    expect(snapshot.resolvedWithinSlaPct).toBe(0.5);
    expect(snapshot.medianResolutionMs).toBe((60 + 300) / 2 * 60 * 1000);
  });

  it("returns null percentages/median rather than dividing by zero when nothing is resolved", () => {
    const snapshot = summarizeReportSla(
      [{ priority: ReportPriority.STANDARD, status: ReportStatus.OPEN, createdAt: now, resolvedAt: null }],
      now,
    );
    expect(snapshot.resolvedWithinSlaPct).toBeNull();
    expect(snapshot.medianResolutionMs).toBeNull();
  });
});

describe("getReportSlaSnapshot", () => {
  it("queries only the fields summarizeReportSla needs and delegates to it", async () => {
    const db = {
      report: {
        findMany: async () => [
          {
            priority: ReportPriority.URGENT,
            status: ReportStatus.RESOLVED,
            createdAt: new Date("2026-09-27T00:00:00Z"),
            resolvedAt: new Date("2026-09-27T01:00:00Z"),
          },
        ],
      },
    } as unknown as ReportSlaDb;

    const snapshot = await getReportSlaSnapshot(db, new Date("2026-09-27T12:00:00Z"));
    expect(snapshot.totalReports).toBe(1);
    expect(snapshot.resolvedWithinSlaCount).toBe(1);
  });
});
