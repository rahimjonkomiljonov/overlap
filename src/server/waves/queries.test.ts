import { describe, expect, it, vi } from "vitest";
import { getIncomingWaves, getMatches, type WavesDb } from "./queries";

function fakeDb() {
  const matchFindMany = vi.fn(async () => []);
  const waveFindMany = vi.fn(async () => []);
  const db = {
    block: { findMany: vi.fn(async () => []) },
    match: { findMany: matchFindMany },
    wave: { findMany: waveFindMany },
    meetProposal: { findMany: vi.fn(async () => []) },
  } as unknown as WavesDb;
  return { db, matchFindMany, waveFindMany };
}

describe("a deleted account stops appearing to anyone at once (not only after the 30-day scrub)", () => {
  it("getMatches asks for matches where neither person is a DELETED account", async () => {
    const { db, matchFindMany } = fakeDb();
    await getMatches(db, "me");
    expect(matchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          userA: { status: { not: "DELETED" } },
          userB: { status: { not: "DELETED" } },
        }),
      }),
    );
  });

  it("getIncomingWaves never lists a wave from a DELETED account", async () => {
    const { db, waveFindMany } = fakeDb();
    await getIncomingWaves(db, "me");
    expect(waveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ toUserId: "me", status: "PENDING", fromUser: { status: { not: "DELETED" } } }) }),
    );
  });
});
