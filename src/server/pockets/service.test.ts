import { describe, expect, it, vi } from "vitest";
import { waveFromPocketStep, type WaveFromPocketDb } from "./service";

const mocks = vi.hoisted(() => ({ isPocketMember: vi.fn() }));
vi.mock("./queries", () => ({ isPocketMember: mocks.isPocketMember }));

const viewer = { userId: "me", campusId: "campus-1" };

function fakeDb(options: {
  existingWave?: { id: string } | null;
  blocked?: boolean;
  wavesToday?: number;
  reverseWave?: { id: string; status: string } | null;
}) {
  const { existingWave = null, blocked = false, wavesToday = 0, reverseWave = null } = options;
  const waveCreate = vi.fn(async () => ({ id: "new-wave" }));
  const waveUpdate = vi.fn(async () => ({}));
  const matchCreate = vi.fn(async () => ({ id: "match-1" }));
  const conversationCreate = vi.fn(async () => ({}));
  const notificationUpsert = vi.fn(async () => ({}));
  const blockFindFirst = vi.fn(async () => (blocked ? { id: "b1" } : null));

  const waveFindUnique = vi.fn(async ({ where }: { where: { fromUserId_toUserId: { fromUserId: string } } }) =>
    where.fromUserId_toUserId.fromUserId === viewer.userId ? existingWave : reverseWave,
  );
  const waveCount = vi.fn(async () => wavesToday);

  const tx = {
    wave: { create: waveCreate, update: waveUpdate },
    match: { create: matchCreate },
    conversation: { create: conversationCreate },
    notification: { upsert: notificationUpsert },
  };

  const db = {
    wave: { findUnique: waveFindUnique, count: waveCount },
    block: { findFirst: blockFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  } as unknown as WaveFromPocketDb;

  return { db, waveCreate, waveUpdate, matchCreate, conversationCreate, notificationUpsert };
}

describe("waveFromPocketStep", () => {
  it("is NOT_FOUND when the target is not currently a member of that pocket, and writes nothing", async () => {
    mocks.isPocketMember.mockResolvedValue(false);
    const { db, waveCreate } = fakeDb({});
    const result = await waveFromPocketStep(db, viewer, "course", "c1", "them", undefined);
    expect(result).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("is a no-op success when a wave already exists, and writes nothing", async () => {
    mocks.isPocketMember.mockResolvedValue(true);
    const { db, waveCreate } = fakeDb({ existingWave: { id: "w1" } });
    const result = await waveFromPocketStep(db, viewer, "course", "c1", "them", undefined);
    expect(result).toEqual({ status: "sent", matched: false });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("is BLOCKED when either side has blocked the other, and writes nothing", async () => {
    mocks.isPocketMember.mockResolvedValue(true);
    const { db, waveCreate } = fakeDb({ blocked: true });
    const result = await waveFromPocketStep(db, viewer, "course", "c1", "them", undefined);
    expect(result).toEqual({ status: "error", code: "BLOCKED" });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("is DAILY_CAP_REACHED at 8 waves already sent today, and writes nothing", async () => {
    mocks.isPocketMember.mockResolvedValue(true);
    const { db, waveCreate } = fakeDb({ wavesToday: 8 });
    const result = await waveFromPocketStep(db, viewer, "course", "c1", "them", undefined);
    expect(result).toEqual({ status: "error", code: "DAILY_CAP_REACHED" });
    expect(waveCreate).not.toHaveBeenCalled();
  });

  it("creates a PENDING wave and queues a notification when there is no reverse wave", async () => {
    mocks.isPocketMember.mockResolvedValue(true);
    const { db, waveCreate, matchCreate, notificationUpsert } = fakeDb({ reverseWave: null });
    const result = await waveFromPocketStep(db, viewer, "course", "c1", "them", "hey!");
    expect(result).toEqual({ status: "sent", matched: false });
    expect(waveCreate).toHaveBeenCalledWith({
      data: {
        fromUserId: "me",
        toUserId: "them",
        targetElement: { type: "profile" },
        note: "hey!",
        status: "PENDING",
      },
    });
    expect(matchCreate).not.toHaveBeenCalled();
    expect(notificationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: "wave-received:new-wave" },
      }),
    );
  });

  it("forms a match when the other side already waved first (mutual)", async () => {
    mocks.isPocketMember.mockResolvedValue(true);
    const { db, waveCreate, waveUpdate, matchCreate, conversationCreate } = fakeDb({
      reverseWave: { id: "their-wave", status: "PENDING" },
    });
    const result = await waveFromPocketStep(db, viewer, "club", "k1", "them", undefined);
    expect(result).toEqual({ status: "sent", matched: true });
    expect(waveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "MATCHED" }) }),
    );
    expect(waveUpdate).toHaveBeenCalledWith({
      where: { id: "their-wave" },
      data: { status: "MATCHED" },
    });
    expect(matchCreate).toHaveBeenCalled();
    expect(conversationCreate).toHaveBeenCalled();
  });

  it("does not treat a reverse wave that already matched as mutual (no double match)", async () => {
    mocks.isPocketMember.mockResolvedValue(true);
    const { db, matchCreate } = fakeDb({ reverseWave: { id: "their-wave", status: "MATCHED" } });
    const result = await waveFromPocketStep(db, viewer, "course", "c1", "them", undefined);
    expect(result).toEqual({ status: "sent", matched: false });
    expect(matchCreate).not.toHaveBeenCalled();
  });
});
