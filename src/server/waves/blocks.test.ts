import { describe, expect, it } from "vitest";
import { isBlockedEitherWay, type BlockCheckDb } from "./blocks";

function fakeDb(blocks: { blockerId: string; blockedId: string }[]): BlockCheckDb {
  return {
    block: {
      findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) => {
        const found = blocks.find((b) =>
          where.OR.some((clause) => clause.blockerId === b.blockerId && clause.blockedId === b.blockedId),
        );
        return found ? { id: "block-1" } : null;
      },
    },
  } as unknown as BlockCheckDb;
}

describe("isBlockedEitherWay", () => {
  it("is true when the first user blocked the second", async () => {
    const db = fakeDb([{ blockerId: "a", blockedId: "b" }]);
    expect(await isBlockedEitherWay(db, "a", "b")).toBe(true);
  });

  it("is true when the second user blocked the first (direction doesn't matter)", async () => {
    const db = fakeDb([{ blockerId: "b", blockedId: "a" }]);
    expect(await isBlockedEitherWay(db, "a", "b")).toBe(true);
  });

  it("is false when neither has blocked the other", async () => {
    const db = fakeDb([{ blockerId: "a", blockedId: "c" }]);
    expect(await isBlockedEitherWay(db, "a", "b")).toBe(false);
  });
});
