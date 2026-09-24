import { describe, expect, it } from "vitest";
import { countWavesSentToday, DAILY_WAVE_CAP, type WaveCapDb } from "./cap";

function fakeDb(waves: { fromUserId: string; createdAt: Date }[]): WaveCapDb {
  return {
    wave: {
      count: async ({ where }: { where: { fromUserId: string; createdAt: { gte: Date; lt: Date } } }) =>
        waves.filter(
          (w) =>
            w.fromUserId === where.fromUserId &&
            w.createdAt >= where.createdAt.gte &&
            w.createdAt < where.createdAt.lt,
        ).length,
    },
  } as unknown as WaveCapDb;
}

describe("DAILY_WAVE_CAP", () => {
  it("is 8, per REQUIREMENTS.md D1", () => {
    expect(DAILY_WAVE_CAP).toBe(8);
  });
});

describe("countWavesSentToday", () => {
  const now = new Date("2026-09-26T15:30:00.000Z"); // 2026-09-27 00:30 KST

  it("counts only this user's waves sent within today's Seoul calendar day", async () => {
    const db = fakeDb([
      { fromUserId: "a", createdAt: new Date("2026-09-26T16:00:00.000Z") }, // today (KST)
      { fromUserId: "a", createdAt: new Date("2026-09-27T10:00:00.000Z") }, // today (KST)
      { fromUserId: "a", createdAt: new Date("2026-09-26T14:00:00.000Z") }, // yesterday (KST)
      { fromUserId: "b", createdAt: new Date("2026-09-26T16:00:00.000Z") }, // different user
    ]);
    await expect(countWavesSentToday(db, "a", now)).resolves.toBe(2);
  });

  it("returns 0 for a user with no waves today", async () => {
    const db = fakeDb([]);
    await expect(countWavesSentToday(db, "a", now)).resolves.toBe(0);
  });
});
