import { ModerationActionType, ReportCategory, ReportPriority, ReportStatus } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { getReportsQueue, type ReportsQueueDb } from "./queries";

/** Recursively checks a Prisma `select`/`include` tree never names `forbiddenKey` — same pattern as verification/queries.test.ts's own H4 test. */
function assertNeverSelects(node: unknown, forbiddenKey: string, path = "select") {
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === forbiddenKey) {
      throw new Error(`Forbidden field "${forbiddenKey}" was requested at ${path}.${key}`);
    }
    if (value && typeof value === "object") {
      assertNeverSelects(value, forbiddenKey, `${path}.${key}`);
    }
  }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    category: ReportCategory.HARASSMENT,
    priority: ReportPriority.STANDARD,
    status: ReportStatus.OPEN,
    createdAt: new Date("2026-09-25T00:00:00Z"),
    description: null,
    evidence: null,
    reporterId: "reporter-1",
    reporter: { name: "신고자" },
    targetId: "target-1",
    target: { name: "대상자", status: "ACTIVE", moderationActionsReceived: [] },
    actions: [],
    ...overrides,
  };
}

function fakeDb(rows: ReturnType<typeof row>[]): ReportsQueueDb {
  return {
    report: {
      findMany: async ({ select }: { select: unknown }) => {
        assertNeverSelects(select, "interestedIn");
        return rows;
      },
    },
  } as unknown as ReportsQueueDb;
}

describe("getReportsQueue", () => {
  it("never requests the sensitive interestedIn field (H4)", async () => {
    const queue = await getReportsQueue(fakeDb([row()]));
    expect(queue).toHaveLength(1);
    expect(JSON.stringify(queue)).not.toContain("interestedIn");
  });

  it("maps a row to the queue-item shape, including a computed SLA deadline", () => {
    return getReportsQueue(fakeDb([row()])).then((queue) => {
      const [item] = queue;
      expect(item.reportId).toBe("r1");
      expect(item.reporterName).toBe("신고자");
      expect(item.targetName).toBe("대상자");
      expect(item.slaDeadline).toEqual(new Date("2026-09-26T00:00:00Z"));
    });
  });

  it("counts prior WARN/SUSPEND/BAN actions against the target as strikes, ignoring DISMISS", async () => {
    const [item] = await getReportsQueue(
      fakeDb([
        row({
          target: {
            name: "대상자",
            status: "ACTIVE",
            moderationActionsReceived: [
              { type: ModerationActionType.WARN },
              { type: ModerationActionType.DISMISS },
              { type: ModerationActionType.SUSPEND },
            ],
          },
        }),
      ]),
    );
    expect(item.priorStrikes).toBe(2);
  });

  it("maps nested moderation actions with their actor's name", async () => {
    const [item] = await getReportsQueue(
      fakeDb([
        row({
          actions: [
            {
              id: "a1",
              type: ModerationActionType.WARN,
              reason: "spam",
              createdAt: new Date("2026-09-25T01:00:00Z"),
              appealNote: null,
              appealedAt: null,
              actor: { name: "모더레이터" },
            },
          ],
        }),
      ]),
    );
    expect(item.actions).toEqual([
      {
        id: "a1",
        type: ModerationActionType.WARN,
        reason: "spam",
        actorName: "모더레이터",
        createdAt: new Date("2026-09-25T01:00:00Z"),
        appealNote: null,
        appealedAt: null,
      },
    ]);
  });
});
