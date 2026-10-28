import { describe, expect, it, vi } from "vitest";
import { passPickStep, sendWaveStep, type PassPickDb, type SendWaveDb } from "./service";

function fakeDb(
  item: { id: string; decision: string | null; dailyBatch: { userId: string } } | null,
) {
  const update = vi.fn(async () => ({}));
  const db = {
    batchItem: { findUnique: vi.fn(async () => item), update },
  } as unknown as PassPickDb;
  return { db, update };
}

function fakeWaveDb(options: {
  item?: { id: string; decision: string | null; candidateUserId: string; dailyBatch: { userId: string } } | null;
  existingWave?: { id: string } | null;
  blocked?: boolean;
  wavesToday?: number;
  reverseWave?: { id: string; status: string } | null;
}) {
  const {
    item = { id: "i1", decision: null, candidateUserId: "them", dailyBatch: { userId: "me" } },
    existingWave = null,
    blocked = false,
    wavesToday = 0,
    reverseWave = null,
  } = options;
  const batchItemUpdate = vi.fn(async () => ({}));
  const waveCreate = vi.fn(async () => ({ id: "new-wave" }));
  const waveUpdate = vi.fn(async () => ({}));
  const matchCreate = vi.fn(async () => ({ id: "match-1" }));
  const conversationCreate = vi.fn(async () => ({}));
  const notificationUpsert = vi.fn(async () => ({}));
  const blockFindFirst = vi.fn(async () => (blocked ? { id: "b1" } : null));

  const waveFindUnique = vi.fn(async ({ where }: { where: { fromUserId_toUserId: { fromUserId: string } } }) =>
    where.fromUserId_toUserId.fromUserId === "me" ? existingWave : reverseWave,
  );
  const waveCount = vi.fn(async () => wavesToday);

  const tx = {
    batchItem: { update: batchItemUpdate },
    wave: { create: waveCreate, update: waveUpdate },
    match: { create: matchCreate },
    conversation: { create: conversationCreate },
    notification: { upsert: notificationUpsert },
  };

  const db = {
    batchItem: { findUnique: vi.fn(async () => item), update: batchItemUpdate },
    wave: { findUnique: waveFindUnique, count: waveCount },
    block: { findFirst: blockFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  } as unknown as SendWaveDb;

  return { db, batchItemUpdate, waveCreate, waveUpdate, matchCreate, conversationCreate, notificationUpsert };
}

describe("passPickStep", () => {
  const now = new Date("2026-10-24T03:00:00Z");

  it("marks the caller's own undecided pick as passed, with the time", async () => {
    const { db, update } = fakeDb({ id: "i1", decision: null, dailyBatch: { userId: "me" } });
    expect(await passPickStep(db, { userId: "me" }, "i1", now)).toEqual({ status: "passed" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { decision: "PASSED", decidedAt: now },
    });
  });

  it("treats someone else's pick exactly like one that does not exist, and writes nothing", async () => {
    for (const item of [{ id: "i1", decision: null, dailyBatch: { userId: "other" } }, null]) {
      const { db, update } = fakeDb(item);
      expect(await passPickStep(db, { userId: "me" }, "i1", now)).toEqual({
        status: "error",
        code: "NOT_FOUND",
      });
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("refuses a pick that was already passed or waved, and writes nothing", async () => {
    for (const decision of ["PASSED", "WAVED"]) {
      const { db, update } = fakeDb({ id: "i1", decision, dailyBatch: { userId: "me" } });
      expect(await passPickStep(db, { userId: "me" }, "i1", now)).toEqual({
        status: "error",
        code: "ALREADY_DECIDED",
      });
      expect(update).not.toHaveBeenCalled();
    }
  });
});

describe("sendWaveStep", () => {
  const profile = { type: "profile" as const };

  it("treats someone else's pick exactly like one that does not exist, and writes nothing", async () => {
    for (const item of [
      { id: "i1", decision: null, candidateUserId: "them", dailyBatch: { userId: "other" } },
      null,
    ]) {
      const { db, waveCreate } = fakeWaveDb({ item });
      expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
        status: "error",
        code: "NOT_FOUND",
      });
      expect(waveCreate).not.toHaveBeenCalled();
    }
  });

  it("refuses a pick already decided, and writes nothing", async () => {
    const { db, waveCreate } = fakeWaveDb({
      item: { id: "i1", decision: "PASSED", candidateUserId: "them", dailyBatch: { userId: "me" } },
    });
    expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
      status: "error",
      code: "ALREADY_DECIDED",
    });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("marks the pick WAVED without a new Wave row when one already exists for that person", async () => {
    const { db, batchItemUpdate, waveCreate } = fakeWaveDb({ existingWave: { id: "w0" } });
    expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
      status: "sent",
      matched: false,
    });
    expect(waveCreate).not.toHaveBeenCalled();
    expect(batchItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ decision: "WAVED" }) }),
    );
  });

  it("is BLOCKED when either side has blocked the other, and writes nothing", async () => {
    const { db, waveCreate } = fakeWaveDb({ blocked: true });
    expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
      status: "error",
      code: "BLOCKED",
    });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("is DAILY_CAP_REACHED at 8 waves already sent today, and writes nothing", async () => {
    const { db, waveCreate } = fakeWaveDb({ wavesToday: 8 });
    expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
      status: "error",
      code: "DAILY_CAP_REACHED",
    });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("creates a PENDING wave, marks the pick WAVED and queues a notification when there is no reverse wave", async () => {
    const { db, batchItemUpdate, waveCreate, matchCreate, notificationUpsert } = fakeWaveDb({ reverseWave: null });
    const now = new Date("2026-10-28T03:00:00Z");
    const result = await sendWaveStep(db, { userId: "me" }, "i1", profile, "hi!", now);
    expect(result).toEqual({ status: "sent", matched: false });
    expect(batchItemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { decision: "WAVED", decidedAt: now } });
    expect(waveCreate).toHaveBeenCalledWith({
      data: {
        batchItemId: "i1",
        fromUserId: "me",
        toUserId: "them",
        targetElement: profile,
        note: "hi!",
        status: "PENDING",
      },
    });
    expect(matchCreate).not.toHaveBeenCalled();
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dedupeKey: "wave-received:new-wave" } }),
    );
  });

  it("forms a match when the other side already waved first (mutual)", async () => {
    const { db, waveCreate, waveUpdate, matchCreate, conversationCreate } = fakeWaveDb({
      reverseWave: { id: "their-wave", status: "PENDING" },
    });
    expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
      status: "sent",
      matched: true,
    });
    expect(waveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "MATCHED" }) }),
    );
    expect(waveUpdate).toHaveBeenCalledWith({ where: { id: "their-wave" }, data: { status: "MATCHED" } });
    expect(matchCreate).toHaveBeenCalled();
    expect(conversationCreate).toHaveBeenCalled();
  });

  it("does not treat a reverse wave that already matched as mutual (no double match)", async () => {
    const { db, matchCreate } = fakeWaveDb({ reverseWave: { id: "their-wave", status: "MATCHED" } });
    expect(await sendWaveStep(db, { userId: "me" }, "i1", profile, undefined)).toEqual({
      status: "sent",
      matched: false,
    });
    expect(matchCreate).not.toHaveBeenCalled();
  });
});
