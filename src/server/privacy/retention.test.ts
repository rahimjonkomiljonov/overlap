import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PURGE_GRACE_DAYS,
  findAccountsToPurge,
  findMessagesToPurge,
  findReportsToPurgeEvidence,
  MESSAGE_RETENTION_DAYS,
  purgeDeletedAccounts,
  purgeExpiredMessages,
  purgeReportEvidence,
  REPORT_EVIDENCE_RETENTION_DAYS,
  type AccountPurgeDb,
  type MessageRetentionDb,
  type ReportEvidenceRetentionDb,
} from "./retention";

const NOW = new Date("2026-10-03T00:00:00Z");
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("constants", () => {
  it("match REQUIREMENTS.md §15.4", () => {
    expect(MESSAGE_RETENTION_DAYS).toBe(30);
    expect(REPORT_EVIDENCE_RETENTION_DAYS).toBe(90);
    expect(ACCOUNT_PURGE_GRACE_DAYS).toBe(30);
  });
});

// --- messages: 30d after unmatch OR 30d after either side's account deletion ---

interface FakeMessageRow {
  id: string;
  conversation: {
    match: { status: "ACTIVE" | "UNMATCHED"; unmatchedAt: Date | null; userA: { deletedAt: Date | null }; userB: { deletedAt: Date | null } };
  };
}

/**
 * Actually evaluates the real nested `OR` where clause `messagePurgeWhere` builds
 * (rather than reimplementing its logic independently) against nested fake rows shaped
 * like the real Message → Conversation → Match → User relations — so this exercises
 * the real where-clause-construction code, not a parallel copy of its intent.
 */
type MessageWhere = {
  OR: [
    { conversation: { match: { status: "UNMATCHED"; unmatchedAt: { lte: Date } } } },
    { conversation: { match: { userA: { deletedAt: { lte: Date } } } } },
    { conversation: { match: { userB: { deletedAt: { lte: Date } } } } },
  ];
};

function matchesMessageWhere(row: FakeMessageRow, where: MessageWhere): boolean {
  const [unmatchedCond, userACond, userBCond] = where.OR;
  const m = row.conversation.match;
  const unmatchedHit = m.status === unmatchedCond.conversation.match.status && m.unmatchedAt !== null && m.unmatchedAt.getTime() <= unmatchedCond.conversation.match.unmatchedAt.lte.getTime();
  const userAHit = m.userA.deletedAt !== null && m.userA.deletedAt.getTime() <= userACond.conversation.match.userA.deletedAt.lte.getTime();
  const userBHit = m.userB.deletedAt !== null && m.userB.deletedAt.getTime() <= userBCond.conversation.match.userB.deletedAt.lte.getTime();
  return unmatchedHit || userAHit || userBHit;
}

function fakeMessageDb(rows: FakeMessageRow[]) {
  const auditLog: { action: string; metadata: unknown }[] = [];

  const db: MessageRetentionDb = {
    message: {
      findMany: (async ({ where }: { where: MessageWhere }) =>
        rows.filter((r) => matchesMessageWhere(r, where)).map((r) => ({ id: r.id }))) as never,
      deleteMany: (async ({ where }: { where: MessageWhere }) => {
        const toDelete = rows.filter((r) => matchesMessageWhere(r, where));
        for (const row of toDelete) {
          rows.splice(rows.indexOf(row), 1);
        }
        return { count: toDelete.length };
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    auditLog: {
      create: (async ({ data }: { data: { action: string; metadata: unknown } }) => {
        auditLog.push({ action: data.action, metadata: data.metadata });
        return {} as never;
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, rows, auditLog };
}

function messageRow(
  id: string,
  overrides: Partial<{ status: "ACTIVE" | "UNMATCHED"; unmatchedAt: Date | null; userADeletedAt: Date | null; userBDeletedAt: Date | null }> = {},
): FakeMessageRow {
  return {
    id,
    conversation: {
      match: {
        status: overrides.status ?? "ACTIVE",
        unmatchedAt: overrides.unmatchedAt ?? null,
        userA: { deletedAt: overrides.userADeletedAt ?? null },
        userB: { deletedAt: overrides.userBDeletedAt ?? null },
      },
    },
  };
}

describe("message retention", () => {
  it("finds messages exactly at the 30-day-unmatched boundary, excludes 29 days", async () => {
    const { db } = fakeMessageDb([
      messageRow("exactly-30d", { status: "UNMATCHED", unmatchedAt: daysAgo(30) }),
      messageRow("29d", { status: "UNMATCHED", unmatchedAt: daysAgo(29) }),
      messageRow("still-active"),
    ]);
    const found = await findMessagesToPurge(db, NOW);
    expect(found.map((r) => r.id)).toEqual(["exactly-30d"]);
  });

  it("also purges when either side's account was deleted 30+ days ago, even if still ACTIVE", async () => {
    const { db } = fakeMessageDb([
      messageRow("userA-deleted", { userADeletedAt: daysAgo(31) }),
      messageRow("userB-deleted", { userBDeletedAt: daysAgo(45) }),
      messageRow("neither", { userADeletedAt: daysAgo(5) }),
    ]);
    const found = await findMessagesToPurge(db, NOW);
    expect(found.map((r) => r.id).sort()).toEqual(["userA-deleted", "userB-deleted"]);
  });

  it("purgeExpiredMessages deletes the eligible rows outright and logs the count", async () => {
    const { db, rows, auditLog } = fakeMessageDb([
      messageRow("old", { status: "UNMATCHED", unmatchedAt: daysAgo(40) }),
      messageRow("keep"),
    ]);
    const count = await purgeExpiredMessages(db, { now: NOW });
    expect(count).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["keep"]);
    expect(auditLog).toEqual([{ action: "retention_purge_messages", metadata: { count: 1 } }]);
  });

  it("is idempotent and does not log again once nothing is eligible", async () => {
    const { db, auditLog } = fakeMessageDb([messageRow("old", { status: "UNMATCHED", unmatchedAt: daysAgo(40) })]);
    await purgeExpiredMessages(db, { now: NOW });
    const secondCount = await purgeExpiredMessages(db, { now: NOW });
    expect(secondCount).toBe(0);
    expect(auditLog).toHaveLength(1);
  });
});

// --- report evidence: 90d after resolvedAt, keep row, null evidence only ---

interface FakeReportRow {
  id: string;
  resolvedAt: Date | null;
  evidence: unknown;
}

function fakeReportDb(rows: FakeReportRow[]) {
  const auditLog: { action: string; metadata: unknown }[] = [];
  const db: ReportEvidenceRetentionDb = {
    report: {
      findMany: (async ({ where }: { where: { resolvedAt: { lte: Date } } }) =>
        rows
          .filter((r) => r.resolvedAt !== null && r.resolvedAt.getTime() <= where.resolvedAt.lte.getTime())
          .map((r) => ({ id: r.id, evidence: r.evidence }))) as never,
      updateMany: (async ({ where }: { where: { id: { in: string[] } } }) => {
        let count = 0;
        for (const row of rows) {
          if (where.id.in.includes(row.id)) {
            row.evidence = null;
            count++;
          }
        }
        return { count };
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    auditLog: {
      create: (async ({ data }: { data: { action: string; metadata: unknown } }) => {
        auditLog.push({ action: data.action, metadata: data.metadata });
        return {} as never;
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, rows, auditLog };
}

describe("report evidence retention", () => {
  it("finds only resolved reports at/past the 90-day boundary with evidence still present", async () => {
    const { db } = fakeReportDb([
      { id: "exactly-90d", resolvedAt: daysAgo(90), evidence: { messages: [] } },
      { id: "89d", resolvedAt: daysAgo(89), evidence: { messages: [] } },
      { id: "still-open", resolvedAt: null, evidence: { messages: [] } },
      { id: "already-purged", resolvedAt: daysAgo(120), evidence: null },
    ]);
    const found = await findReportsToPurgeEvidence(db, NOW);
    expect(found.map((r) => r.id)).toEqual(["exactly-90d"]);
  });

  it("nulls evidence and keeps the row, logging a purge count", async () => {
    const { db, rows, auditLog } = fakeReportDb([{ id: "r1", resolvedAt: daysAgo(91), evidence: { messages: ["hi"] } }]);
    const count = await purgeReportEvidence(db, { now: NOW });
    expect(count).toBe(1);
    expect(rows[0].evidence).toBeNull();
    expect(auditLog).toEqual([{ action: "retention_purge_report_evidence", metadata: { count: 1 } }]);
  });

  it("is idempotent: a second run finds and purges nothing once evidence is already null", async () => {
    const { db, auditLog } = fakeReportDb([{ id: "r1", resolvedAt: daysAgo(91), evidence: { messages: ["hi"] } }]);
    await purgeReportEvidence(db, { now: NOW });
    const secondCount = await purgeReportEvidence(db, { now: NOW });
    expect(secondCount).toBe(0);
    expect(auditLog).toHaveLength(1); // no second log entry for a no-op run
  });

  it("never touches a still-open report's evidence", async () => {
    const { db, rows } = fakeReportDb([{ id: "open", resolvedAt: null, evidence: { messages: ["hi"] } }]);
    await purgeReportEvidence(db, { now: NOW });
    expect(rows[0].evidence).toEqual({ messages: ["hi"] });
  });
});

// --- account purge: 30d after deletedAt, scrub PII, delete profile+storage, keep row ---

interface FakeUserRow {
  id: string;
  status: string;
  deletedAt: Date | null;
  purgedAt: Date | null;
  email: string;
  name: string;
  image: string | null;
  birthYear: number | null;
  ageVerifiedAt: Date | null;
  photoStorageKeys: string[];
  selfieStorageKeys: (string | null)[];
}

function fakeAccountDb(rows: FakeUserRow[]) {
  const profileDeletes: string[] = [];
  const selfieUpdates: string[] = [];
  const auditLog: { action: string; metadata: unknown }[] = [];

  const db: AccountPurgeDb = {
    user: {
      findMany: (async ({ where }: { where: { status: string; deletedAt: { lte: Date }; purgedAt: null } }) =>
        rows
          .filter(
            (r) =>
              r.status === where.status &&
              r.deletedAt !== null &&
              r.deletedAt.getTime() <= where.deletedAt.lte.getTime() &&
              r.purgedAt === null,
          )
          .map((r) => ({
            id: r.id,
            profile: { photos: r.photoStorageKeys.map((storageKey) => ({ storageKey })) },
            selfies: r.selfieStorageKeys.map((storageKey) => ({ storageKey })),
          }))) as never,
      update: (async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    profile: {
      deleteMany: (async ({ where }: { where: { userId: string } }) => {
        profileDeletes.push(where.userId);
        return { count: 1 };
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    selfie: {
      updateMany: (async ({ where }: { where: { userId: string } }) => {
        selfieUpdates.push(where.userId);
        return { count: 1 };
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    auditLog: {
      create: (async ({ data }: { data: { action: string; metadata: unknown } }) => {
        auditLog.push({ action: data.action, metadata: data.metadata });
        return {} as never;
      }) as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, rows, profileDeletes, selfieUpdates, auditLog };
}

function userRow(overrides: Partial<FakeUserRow> & { id: string }): FakeUserRow {
  return {
    status: "DELETED",
    deletedAt: daysAgo(31),
    purgedAt: null,
    email: `${overrides.id}@test.ac.kr`,
    name: "Test User",
    image: "https://example.com/a.jpg",
    birthYear: 2004,
    ageVerifiedAt: daysAgo(400),
    photoStorageKeys: [],
    selfieStorageKeys: [],
    ...overrides,
  };
}

describe("account purge", () => {
  it("finds only DELETED accounts at/past the 30-day grace period, not yet purged", async () => {
    const { db } = fakeAccountDb([
      userRow({ id: "exactly-30d", deletedAt: daysAgo(30) }),
      userRow({ id: "29d", deletedAt: daysAgo(29) }),
      userRow({ id: "active", status: "ACTIVE", deletedAt: null }),
      userRow({ id: "already-purged", deletedAt: daysAgo(60), purgedAt: daysAgo(1) }),
    ]);
    const found = await findAccountsToPurge(db, NOW);
    expect(found.map((a) => a.id)).toEqual(["exactly-30d"]);
  });

  it("deletes storage files, deletes the profile row, scrubs the user row, and keeps the row itself", async () => {
    const { db, rows, profileDeletes, selfieUpdates } = fakeAccountDb([
      userRow({ id: "u1", photoStorageKeys: ["p1", "p2"], selfieStorageKeys: ["s1"] }),
    ]);
    const deletedPhotos: string[] = [];
    const deletedSelfies: string[] = [];

    const count = await purgeDeletedAccounts(db, {
      now: NOW,
      deletePhotoFile: async (key) => void deletedPhotos.push(key),
      deleteSelfieFile: async (key) => void deletedSelfies.push(key),
    });

    expect(count).toBe(1);
    expect(deletedPhotos.sort()).toEqual(["p1", "p2"]);
    expect(deletedSelfies).toEqual(["s1"]);
    expect(profileDeletes).toEqual(["u1"]);
    expect(selfieUpdates).toEqual(["u1"]);
    expect(rows[0]).toMatchObject({
      email: "deleted-u1@purged.invalid",
      name: "Deleted user",
      image: null,
      birthYear: null,
      ageVerifiedAt: null,
      purgedAt: NOW,
    });
  });

  it("is idempotent: a second run finds nothing once purgedAt is set", async () => {
    const { db } = fakeAccountDb([userRow({ id: "u1" })]);
    await purgeDeletedAccounts(db, { now: NOW });
    const secondCount = await purgeDeletedAccounts(db, { now: NOW });
    expect(secondCount).toBe(0);
  });

  it("never touches a still-ACTIVE or not-yet-30-days account", async () => {
    const { db, rows } = fakeAccountDb([userRow({ id: "recent", deletedAt: daysAgo(5) })]);
    await purgeDeletedAccounts(db, { now: NOW });
    expect(rows[0].email).toBe("recent@test.ac.kr");
    expect(rows[0].purgedAt).toBeNull();
  });
});
