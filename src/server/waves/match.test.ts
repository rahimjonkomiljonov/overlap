import { describe, expect, it } from "vitest";
import { formMatch, type FormMatchDb } from "./match";

function fakeDb() {
  const waveUpdates: { id: string; status: string }[] = [];
  const matchesCreated: { userAId: string; userBId: string }[] = [];
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
        return {} as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, waveUpdates, matchesCreated };
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
});
