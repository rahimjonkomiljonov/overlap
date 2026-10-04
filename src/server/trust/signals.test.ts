import { describe, expect, it } from "vitest";
import { loadTrustSignals, type TrustSignalsDb } from "./signals";

function fakeDb(data: {
  reports?: { targetId: string; reporterId: string }[];
  warnings?: { targetId: string }[];
  feedback?: { userId: string; userAId: string; userBId: string }[];
}) {
  const seen: Record<string, unknown> = {};
  const db = {
    report: {
      findMany: async (args: unknown) => {
        seen.report = args;
        return data.reports ?? [];
      },
    },
    moderationAction: {
      findMany: async (args: unknown) => {
        seen.moderationAction = args;
        return data.warnings ?? [];
      },
    },
    meetupFeedbackEntry: {
      findMany: async () =>
        (data.feedback ?? []).map((f) => ({ userId: f.userId, proposal: { match: { userAId: f.userAId, userBId: f.userBId } } })),
    },
  } as unknown as TrustSignalsDb;
  return { db, seen };
}

const NOW = new Date("2026-10-05T00:00:00Z");

describe("loadTrustSignals", () => {
  it("counts distinct reporters, not reports", async () => {
    const { db } = fakeDb({
      reports: [
        { targetId: "t", reporterId: "r1" },
        { targetId: "t", reporterId: "r1" },
        { targetId: "t", reporterId: "r2" },
      ],
    });
    const signals = await loadTrustSignals(db, ["t"], NOW);
    expect(signals.get("t")).toEqual({ reporters: 2, warnings: 0, uncomfortableMeetups: 0 });
  });

  it("excludes dismissed reports and anything older than the window in the query itself", async () => {
    const { db, seen } = fakeDb({});
    await loadTrustSignals(db, ["t"], NOW);
    const where = (seen.report as { where: Record<string, unknown> }).where;
    expect(where.actions).toEqual({ none: { type: "DISMISS" } });
    expect((where.createdAt as { gte: Date }).gte.getTime()).toBeLessThan(NOW.getTime());
    expect((seen.moderationAction as { where: { type: string } }).where.type).toBe("WARN");
  });

  it("attributes uncomfortable-meetup feedback to the other person in the match, once per giver", async () => {
    const { db } = fakeDb({
      feedback: [
        { userId: "giver", userAId: "giver", userBId: "t" },
        { userId: "giver", userAId: "t", userBId: "giver" },
        { userId: "t", userAId: "t", userBId: "x" },
      ],
    });
    const signals = await loadTrustSignals(db, ["t"], NOW);
    expect(signals.get("t")?.uncomfortableMeetups).toBe(1);
    // x isn't in the requested ids, so t's own feedback about x isn't counted for anyone here.
    expect(signals.has("x")).toBe(false);
  });

  it("returns nothing for users with no signals and skips the queries for no users", async () => {
    const { db, seen } = fakeDb({});
    expect((await loadTrustSignals(db, ["a"], NOW)).size).toBe(0);
    const empty = fakeDb({});
    expect((await loadTrustSignals(empty.db, [], NOW)).size).toBe(0);
    expect(empty.seen.report).toBeUndefined();
    expect(seen.report).toBeDefined();
  });
});
