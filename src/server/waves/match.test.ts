import { describe, expect, it } from "vitest";
import { formMatch, type FormMatchDb } from "./match";

function fakeDb() {
  const waveUpdates: { id: string; status: string }[] = [];
  const matchesCreated: { userAId: string; userBId: string }[] = [];
  const conversationsCreated: { matchId: string }[] = [];
  const notificationsQueued: { userId: string; type: string; dedupeKey: string }[] = [];
  let nextMatchId = 0;
  const db: FormMatchDb = {
    wave: {
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        waveUpdates.push({ id: where.id, status: data.status });
        return {} as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    match: {
      create: async ({ data }: { data: { userAId: string; userBId: string } }) => {
        matchesCreated.push({ userAId: data.userAId, userBId: data.userBId });
        return { id: `match-${nextMatchId++}` } as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    conversation: {
      create: async ({ data }: { data: { matchId: string } }) => {
        conversationsCreated.push({ matchId: data.matchId });
        return {} as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    notification: {
      upsert: async ({ create }: { create: { userId: string; type: string; dedupeKey: string } }) => {
        notificationsQueued.push({ userId: create.userId, type: create.type, dedupeKey: create.dedupeKey });
        return {} as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, waveUpdates, matchesCreated, conversationsCreated, notificationsQueued };
}

describe("formMatch", () => {
  it("marks the other wave MATCHED", async () => {
    const { db, waveUpdates } = fakeDb();
    await formMatch(db, "user-b", "user-a", "other-wave-id");
    expect(waveUpdates).toEqual([{ id: "other-wave-id", status: "MATCHED" }]);
  });

  it("creates a Match with userAId/userBId ordered regardless of argument order", async () => {
    const { db: db1, matchesCreated: created1 } = fakeDb();
    await formMatch(db1, "zzz", "aaa", "w1");
    expect(created1).toEqual([{ userAId: "aaa", userBId: "zzz" }]);

    const { db: db2, matchesCreated: created2 } = fakeDb();
    await formMatch(db2, "aaa", "zzz", "w2");
    expect(created2).toEqual([{ userAId: "aaa", userBId: "zzz" }]);
  });

  it("creates exactly one Conversation for the new Match", async () => {
    const { db, matchesCreated, conversationsCreated } = fakeDb();
    await formMatch(db, "a", "b", "w1");
    expect(conversationsCreated).toEqual([{ matchId: "match-0" }]);
    expect(matchesCreated).toHaveLength(1);
  });

  it("queues a MATCH notification for both users (S18)", async () => {
    const { db, notificationsQueued } = fakeDb();
    await formMatch(db, "user-a", "user-b", "w1");
    expect(notificationsQueued).toHaveLength(2);
    expect(notificationsQueued.map((n) => n.userId).sort()).toEqual(["user-a", "user-b"]);
    for (const n of notificationsQueued) {
      expect(n.type).toBe("MATCH");
      expect(n.dedupeKey).toBe(`match:match-0:${n.userId}`);
    }
  });
});
