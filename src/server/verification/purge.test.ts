import { describe, expect, it } from "vitest";
import { findSelfiesToPurge, purgeSelfies, SELFIE_RETENTION_DAYS, type PurgeDb } from "./purge";

type Row = {
  id: string;
  storageKey: string | null;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  decidedAt: Date | null;
  purgedAt: Date | null;
};

/**
 * In-memory fake standing in for the two Selfie methods purge.ts actually calls — same
 * pattern as src/server/reference/importers.test.ts. Deliberately narrow (it only
 * understands the exact where-clause shape purge.ts sends) rather than a generic query
 * engine, which is enough to prove the retention-window logic.
 */
function fakeDb(rows: Row[]): PurgeDb {
  return {
    selfie: {
      findMany: async ({ where }: { where: { decision: { in: string[] }; decidedAt: { lte: Date } } }) =>
        rows
          .filter((r) => where.decision.in.includes(r.decision))
          .filter((r) => r.decidedAt !== null && r.decidedAt.getTime() <= where.decidedAt.lte.getTime())
          .filter((r) => r.storageKey !== null)
          .map((r) => ({ id: r.id, storageKey: r.storageKey })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`no such row ${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as PurgeDb;
}

const NOW = new Date("2026-10-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("findSelfiesToPurge / purgeSelfies", () => {
  it(`finds a decided selfie past the ${SELFIE_RETENTION_DAYS}-day window`, async () => {
    const rows: Row[] = [
      { id: "old", storageKey: "k1", decision: "APPROVED", decidedAt: daysAgo(8), purgedAt: null },
    ];
    const found = await findSelfiesToPurge(fakeDb(rows), NOW);
    expect(found.map((f) => f.id)).toEqual(["old"]);
  });

  it("does not find a selfie decided within the retention window", async () => {
    const rows: Row[] = [
      { id: "recent", storageKey: "k1", decision: "APPROVED", decidedAt: daysAgo(3), purgedAt: null },
    ];
    expect(await findSelfiesToPurge(fakeDb(rows), NOW)).toEqual([]);
  });

  it("never finds a still-pending selfie, however old", async () => {
    const rows: Row[] = [
      { id: "pending", storageKey: "k1", decision: "PENDING", decidedAt: null, purgedAt: null },
    ];
    expect(await findSelfiesToPurge(fakeDb(rows), NOW)).toEqual([]);
  });

  it("skips a selfie whose image was already purged", async () => {
    const rows: Row[] = [
      { id: "already", storageKey: null, decision: "REJECTED", decidedAt: daysAgo(30), purgedAt: daysAgo(20) },
    ];
    expect(await findSelfiesToPurge(fakeDb(rows), NOW)).toEqual([]);
  });

  it("deletes the file and clears storageKey/sets purgedAt, keeping the row", async () => {
    const rows: Row[] = [
      { id: "old", storageKey: "k1", decision: "APPROVED", decidedAt: daysAgo(10), purgedAt: null },
      { id: "recent", storageKey: "k2", decision: "REJECTED", decidedAt: daysAgo(1), purgedAt: null },
    ];
    const deleted: string[] = [];
    const count = await purgeSelfies(fakeDb(rows), { now: NOW, deleteFile: async (key) => void deleted.push(key) });

    expect(count).toBe(1);
    expect(deleted).toEqual(["k1"]);
    expect(rows[0]).toMatchObject({ storageKey: null, purgedAt: NOW });
    // Decision and decidedAt are untouched — only the image is gone.
    expect(rows[0].decision).toBe("APPROVED");
    // The recent one is left alone entirely.
    expect(rows[1]).toMatchObject({ storageKey: "k2", purgedAt: null });
  });

  it("purges nothing and never calls deleteFile when nothing is eligible", async () => {
    const rows: Row[] = [
      { id: "recent", storageKey: "k1", decision: "APPROVED", decidedAt: daysAgo(1), purgedAt: null },
    ];
    let calls = 0;
    const count = await purgeSelfies(fakeDb(rows), { now: NOW, deleteFile: async () => void calls++ });
    expect(count).toBe(0);
    expect(calls).toBe(0);
  });
});
