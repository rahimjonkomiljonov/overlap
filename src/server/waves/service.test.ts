import { describe, expect, it, vi } from "vitest";
import { declineWaveStep, waveBackStep, type DeclineWaveDb, type WaveBackDb } from "./service";

function fakeWaveBackDb(options: {
  incoming?: { id: string; toUserId: string; fromUserId: string; status: string } | null;
  blocked?: boolean;
  wavesToday?: number;
}) {
  const { incoming = { id: "w1", toUserId: "me", fromUserId: "them", status: "PENDING" }, blocked = false, wavesToday = 0 } = options;
  const waveCreate = vi.fn(async () => ({ id: "new-wave" }));
  const waveUpdate = vi.fn(async () => ({}));
  const matchCreate = vi.fn(async () => ({ id: "match-1" }));
  const conversationCreate = vi.fn(async () => ({}));
  const notificationUpsert = vi.fn(async () => ({}));
  const blockFindFirst = vi.fn(async () => (blocked ? { id: "b1" } : null));
  const waveCount = vi.fn(async () => wavesToday);

  const tx = {
    wave: { create: waveCreate, update: waveUpdate },
    match: { create: matchCreate },
    conversation: { create: conversationCreate },
    notification: { upsert: notificationUpsert },
  };

  const db = {
    wave: { findUnique: vi.fn(async () => incoming), count: waveCount },
    block: { findFirst: blockFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  } as unknown as WaveBackDb;

  return { db, waveCreate, waveUpdate, matchCreate, conversationCreate };
}

describe("waveBackStep", () => {
  it("is NOT_FOUND for someone else's wave, or one that does not exist, and writes nothing", async () => {
    for (const incoming of [{ id: "w1", toUserId: "other", fromUserId: "them", status: "PENDING" }, null]) {
      const { db, waveCreate } = fakeWaveBackDb({ incoming });
      expect(await waveBackStep(db, { userId: "me" }, "w1", undefined)).toEqual({
        status: "error",
        code: "NOT_FOUND",
      });
      expect(waveCreate).not.toHaveBeenCalled();
    }
  });

  it("refuses a wave already decided, and writes nothing", async () => {
    for (const status of ["MATCHED", "DECLINED"]) {
      const { db, waveCreate } = fakeWaveBackDb({ incoming: { id: "w1", toUserId: "me", fromUserId: "them", status } });
      expect(await waveBackStep(db, { userId: "me" }, "w1", undefined)).toEqual({
        status: "error",
        code: "ALREADY_DECIDED",
      });
      expect(waveCreate).not.toHaveBeenCalled();
    }
  });

  it("is BLOCKED when either side has blocked the other, and writes nothing", async () => {
    const { db, waveCreate } = fakeWaveBackDb({ blocked: true });
    expect(await waveBackStep(db, { userId: "me" }, "w1", undefined)).toEqual({
      status: "error",
      code: "BLOCKED",
    });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("is DAILY_CAP_REACHED at 8 waves already sent today, and writes nothing", async () => {
    const { db, waveCreate } = fakeWaveBackDb({ wavesToday: 8 });
    expect(await waveBackStep(db, { userId: "me" }, "w1", undefined)).toEqual({
      status: "error",
      code: "DAILY_CAP_REACHED",
    });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("always forms a match: creates a MATCHED wave the other way and completes the pair", async () => {
    const { db, waveCreate, waveUpdate, matchCreate, conversationCreate } = fakeWaveBackDb({});
    expect(await waveBackStep(db, { userId: "me" }, "w1", "sounds good")).toEqual({ status: "matched" });
    expect(waveCreate).toHaveBeenCalledWith({
      data: {
        fromUserId: "me",
        toUserId: "them",
        targetElement: { type: "profile" },
        note: "sounds good",
        status: "MATCHED",
      },
    });
    expect(waveUpdate).toHaveBeenCalledWith({ where: { id: "w1" }, data: { status: "MATCHED" } });
    expect(matchCreate).toHaveBeenCalled();
    expect(conversationCreate).toHaveBeenCalled();
  });
});

describe("declineWaveStep", () => {
  function fakeDeclineDb(incoming: { id: string; toUserId: string; status: string } | null) {
    const update = vi.fn(async () => ({}));
    const db = { wave: { findUnique: vi.fn(async () => incoming), update } } as unknown as DeclineWaveDb;
    return { db, update };
  }

  it("is NOT_FOUND for someone else's wave, or one that does not exist, and writes nothing", async () => {
    for (const incoming of [{ id: "w1", toUserId: "other", status: "PENDING" }, null]) {
      const { db, update } = fakeDeclineDb(incoming);
      expect(await declineWaveStep(db, { userId: "me" }, "w1")).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("refuses a wave already decided, and writes nothing", async () => {
    const { db, update } = fakeDeclineDb({ id: "w1", toUserId: "me", status: "MATCHED" });
    expect(await declineWaveStep(db, { userId: "me" }, "w1")).toEqual({
      status: "error",
      code: "ALREADY_DECIDED",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("marks a pending wave DECLINED, at no cost to either side's cap", async () => {
    const { db, update } = fakeDeclineDb({ id: "w1", toUserId: "me", status: "PENDING" });
    expect(await declineWaveStep(db, { userId: "me" }, "w1")).toEqual({ status: "declined" });
    expect(update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { status: "DECLINED" } });
  });
});
