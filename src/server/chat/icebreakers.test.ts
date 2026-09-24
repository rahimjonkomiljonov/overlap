import { describe, expect, it } from "vitest";
import { getIcebreakerReasons, type IcebreakerDb } from "./icebreakers";

interface FakeWaveRow {
  fromUserId: string;
  toUserId: string;
  reasons: unknown[] | null;
}

function fakeDb(userAId: string, userBId: string, waves: FakeWaveRow[]): IcebreakerDb {
  return {
    conversation: {
      findUnique: async () => ({ match: { userAId, userBId } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    wave: {
      findMany: async () =>
        waves.map((w) => ({
          fromUserId: w.fromUserId,
          toUserId: w.toUserId,
          batchItem: w.reasons ? { reasons: w.reasons } : null,
        })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("getIcebreakerReasons", () => {
  it("returns the A→B wave's reasons when it has a BatchItem", async () => {
    const db = fakeDb("a", "b", [
      { fromUserId: "a", toUserId: "b", reasons: [{ type: "course", courseId: "c1" }] },
      { fromUserId: "b", toUserId: "a", reasons: null },
    ]);
    const result = await getIcebreakerReasons(db, "conv1");
    expect(result).toEqual([{ type: "course", courseId: "c1" }]);
  });

  it("falls back to the B→A wave's reasons when only that one has a BatchItem", async () => {
    const db = fakeDb("a", "b", [
      { fromUserId: "a", toUserId: "b", reasons: null },
      { fromUserId: "b", toUserId: "a", reasons: [{ type: "club", clubId: "k1" }] },
    ]);
    const result = await getIcebreakerReasons(db, "conv1");
    expect(result).toEqual([{ type: "club", clubId: "k1" }]);
  });

  it("returns [] when neither wave has a BatchItem (both sent from the S14 inbox)", async () => {
    const db = fakeDb("a", "b", [
      { fromUserId: "a", toUserId: "b", reasons: null },
      { fromUserId: "b", toUserId: "a", reasons: null },
    ]);
    expect(await getIcebreakerReasons(db, "conv1")).toEqual([]);
  });

  it("caps at 3 reasons", async () => {
    const db = fakeDb("a", "b", [
      {
        fromUserId: "a",
        toUserId: "b",
        reasons: [
          { type: "course", courseId: "c1" },
          { type: "club", clubId: "k1" },
          { type: "interest", interestTagId: "i1" },
          { type: "values" },
        ],
      },
    ]);
    const result = await getIcebreakerReasons(db, "conv1");
    expect(result).toHaveLength(3);
  });
});
