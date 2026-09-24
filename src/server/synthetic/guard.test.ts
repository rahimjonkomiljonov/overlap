import { afterEach, describe, expect, it, vi } from "vitest";
import { assertNoSyntheticUsersInProduction, type SyntheticGuardDb } from "./guard";

afterEach(() => {
  vi.unstubAllEnvs();
});

function fakeDb(syntheticUserCount: number): SyntheticGuardDb {
  return {
    user: {
      count: async () => syntheticUserCount,
    },
  } as unknown as SyntheticGuardDb;
}

describe("assertNoSyntheticUsersInProduction", () => {
  it("throws when synthetic rows exist under production settings", async () => {
    await expect(
      assertNoSyntheticUsersInProduction(fakeDb(3), { isProduction: true }),
    ).rejects.toThrow(/3 synthetic user/);
  });

  it("does not throw under production settings when no synthetic rows exist", async () => {
    await expect(
      assertNoSyntheticUsersInProduction(fakeDb(0), { isProduction: true }),
    ).resolves.toBeUndefined();
  });

  it("does not throw outside production, however many synthetic rows exist", async () => {
    await expect(
      assertNoSyntheticUsersInProduction(fakeDb(500), { isProduction: false }),
    ).resolves.toBeUndefined();
  });

  it("falls back to NODE_ENV when isProduction isn't passed explicitly", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(assertNoSyntheticUsersInProduction(fakeDb(1))).rejects.toThrow();
  });
});
