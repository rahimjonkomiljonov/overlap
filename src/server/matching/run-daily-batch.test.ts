import { describe, expect, it } from "vitest";
import { IntentMode } from "@/generated/prisma/enums";
import { persistBatch } from "./run-daily-batch";

function fakeDb(create: () => Promise<unknown>) {
  return { dailyBatch: { create } } as unknown as Parameters<typeof persistBatch>[0];
}

const composed = { items: [] } as unknown as Parameters<typeof persistBatch>[4];
const batchDate = new Date("2026-10-04T00:00:00Z");

describe("persistBatch", () => {
  it("treats a concurrent duplicate insert (P2002) as success", async () => {
    const db = fakeDb(() => Promise.reject(Object.assign(new Error("dup"), { code: "P2002" })));
    await expect(
      persistBatch(db, "u1", IntentMode.FRIENDS, batchDate, composed),
    ).resolves.toBeUndefined();
  });

  it("still throws any other database error", async () => {
    const db = fakeDb(() => Promise.reject(Object.assign(new Error("boom"), { code: "P1001" })));
    await expect(persistBatch(db, "u1", IntentMode.FRIENDS, batchDate, composed)).rejects.toThrow(
      "boom",
    );
  });
});
