import { describe, expect, it, vi } from "vitest";
import type { RateLimitDb } from "@/server/auth/rate-limit";
import { enforceRateLimit } from "./rate-limit";

function fakeDb() {
  const rows = new Map<string, { key: string; count: number; windowEnds: Date }>();
  const db = {
    rateLimit: {
      findUnique: vi.fn(
        async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null,
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { key: string };
          create: { key: string; count: number; windowEnds: Date };
        }) => {
          rows.set(where.key, create);
          return create;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { key: string };
          data: { count: { increment: number } };
        }) => {
          const row = rows.get(where.key)!;
          row.count += data.count.increment;
          return row;
        },
      ),
    },
  } as unknown as RateLimitDb;
  return { db, rows };
}

describe("enforceRateLimit", () => {
  it("lets requests through until the limit, then answers 429 RATE_LIMITED", async () => {
    const { db } = fakeDb();
    const limit = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++)
      expect(await enforceRateLimit(db, "waves:user-a", limit)).toBeNull();
    const blocked = await enforceRateLimit(db, "waves:user-a", limit);
    expect(blocked?.status).toBe(429);
    expect(await blocked?.json()).toEqual({ error: "RATE_LIMITED" });
  });

  it("counts each person separately", async () => {
    const { db } = fakeDb();
    const limit = { max: 1, windowMs: 60_000 };
    expect(await enforceRateLimit(db, "waves:user-a", limit)).toBeNull();
    expect(await enforceRateLimit(db, "waves:user-b", limit)).toBeNull();
    expect((await enforceRateLimit(db, "waves:user-a", limit))?.status).toBe(429);
  });

  it("keeps mobile counters apart from the website's", async () => {
    const { db, rows } = fakeDb();
    await enforceRateLimit(db, "waves:user-a", { max: 5, windowMs: 60_000 });
    expect([...rows.keys()]).toEqual(["mobile:waves:user-a"]);
  });
});
