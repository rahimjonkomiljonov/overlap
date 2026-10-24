import { describe, expect, it, vi } from "vitest";
import { passPickStep, type PassPickDb } from "./service";

function fakeDb(
  item: { id: string; decision: string | null; dailyBatch: { userId: string } } | null,
) {
  const update = vi.fn(async () => ({}));
  const db = {
    batchItem: { findUnique: vi.fn(async () => item), update },
  } as unknown as PassPickDb;
  return { db, update };
}

describe("passPickStep", () => {
  const now = new Date("2026-10-24T03:00:00Z");

  it("marks the caller's own undecided pick as passed, with the time", async () => {
    const { db, update } = fakeDb({ id: "i1", decision: null, dailyBatch: { userId: "me" } });
    expect(await passPickStep(db, { userId: "me" }, "i1", now)).toEqual({ status: "passed" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { decision: "PASSED", decidedAt: now },
    });
  });

  it("treats someone else's pick exactly like one that does not exist, and writes nothing", async () => {
    for (const item of [{ id: "i1", decision: null, dailyBatch: { userId: "other" } }, null]) {
      const { db, update } = fakeDb(item);
      expect(await passPickStep(db, { userId: "me" }, "i1", now)).toEqual({
        status: "error",
        code: "NOT_FOUND",
      });
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("refuses a pick that was already passed or waved, and writes nothing", async () => {
    for (const decision of ["PASSED", "WAVED"]) {
      const { db, update } = fakeDb({ id: "i1", decision, dailyBatch: { userId: "me" } });
      expect(await passPickStep(db, { userId: "me" }, "i1", now)).toEqual({
        status: "error",
        code: "ALREADY_DECIDED",
      });
      expect(update).not.toHaveBeenCalled();
    }
  });
});
