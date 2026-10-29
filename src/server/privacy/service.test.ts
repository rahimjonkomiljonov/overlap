import { beforeEach, describe, expect, it, vi } from "vitest";

const exporter = vi.hoisted(() => ({ buildUserDataExport: vi.fn() }));
vi.mock("./export", () => exporter);

import { setWeightSlidersStep } from "@/server/preferences/service";
import { exportMyDataStep, requestAccountDeletionStep, withdrawConsentStep, type DeleteAccountDb, type ExportDataDb, type WithdrawConsentDb } from "./service";

const me = { userId: "me" };
const NOW = new Date("2026-10-29T03:00:00Z");

describe("withdrawConsentStep", () => {
  function fake(latest: { id: string; granted: boolean; withdrawnAt: Date | null } | null) {
    const update = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({}));
    const db = { consent: { findFirst: vi.fn(async () => latest), update }, profile: { updateMany }, dataRequest: { create } } as unknown as WithdrawConsentDb;
    return { db, update, updateMany, create };
  }

  it("is NOT_ACTIVE when there is nothing in force to withdraw, and writes nothing", async () => {
    for (const latest of [null, { id: "c1", granted: false, withdrawnAt: null }, { id: "c1", granted: true, withdrawnAt: new Date() }]) {
      const { db, update, updateMany, create } = fake(latest);
      expect(await withdrawConsentStep(db, me, "MARKETING", NOW)).toEqual({ status: "error", code: "NOT_ACTIVE" });
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("marks the consent withdrawn and records a WITHDRAWAL request, leaving the profile alone for a marketing consent", async () => {
    const { db, update, updateMany, create } = fake({ id: "c1", granted: true, withdrawnAt: null });
    expect(await withdrawConsentStep(db, me, "MARKETING", NOW)).toEqual({ status: "withdrawn" });
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { withdrawnAt: NOW } });
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "me", type: "WITHDRAWAL", status: "COMPLETED" }) });
  });

  it("deletes the stored 'who I'd like to meet' field the moment the sensitive consent is withdrawn", async () => {
    const { db, updateMany } = fake({ id: "c1", granted: true, withdrawnAt: null });
    expect(await withdrawConsentStep(db, me, "SENSITIVE_PREFERENCE", NOW)).toEqual({ status: "withdrawn" });
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: "me" }, data: { interestedIn: null } });
  });
});

describe("requestAccountDeletionStep (two phases: flag now, scrub after the grace period)", () => {
  function fake() {
    const order: string[] = [];
    const update = vi.fn(async () => {
      order.push("update");
      return {};
    });
    const deleteMany = vi.fn(async () => {
      order.push("push");
      return {};
    });
    const create = vi.fn(async () => {
      order.push("request");
      return {};
    });
    const signOut = vi.fn(async () => {
      order.push("signOut");
    });
    const db = { user: { update }, pushSubscription: { deleteMany }, dataRequest: { create } } as unknown as DeleteAccountDb;
    return { db, update, deleteMany, create, signOut, order };
  }

  it("only flags the account DELETED and stamps the date: it never touches personal data", async () => {
    const { db, update } = fake();
    await requestAccountDeletionStep(db, me, { signOut: async () => {} }, NOW);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "me" }, data: { status: "DELETED", deletedAt: NOW } });
    expect(Object.keys((update.mock.calls[0] as unknown as [{ data: object }])[0].data).sort()).toEqual(["deletedAt", "status"]);
  });

  it("stops device pushes, records the request, then signs every session out last", async () => {
    const { db, deleteMany, create, signOut, order } = fake();
    await requestAccountDeletionStep(db, me, { signOut }, NOW);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "me" } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "me", type: "DELETION", status: "COMPLETED" }) });
    expect(order).toEqual(["update", "push", "request", "signOut"]);
  });

  it("says when the personal data will be scrubbed: 30 days after the request", async () => {
    const { db } = fake();
    const result = await requestAccountDeletionStep(db, me, { signOut: async () => {} }, NOW);
    expect(result).toEqual({ status: "deleted", purgeAfter: new Date("2026-11-28T03:00:00Z") });
  });
});

describe("exportMyDataStep", () => {
  beforeEach(() => exporter.buildUserDataExport.mockReset());
  const create = vi.fn(async () => ({}));
  const db = { user: {}, dataRequest: { create } } as unknown as ExportDataDb;

  it("builds the export for the caller alone and records a completed ACCESS request", async () => {
    create.mockClear();
    exporter.buildUserDataExport.mockResolvedValue({ id: "me" });
    expect(await exportMyDataStep(db, me)).toEqual({ status: "ready", data: { id: "me" } });
    expect(exporter.buildUserDataExport).toHaveBeenCalledWith(db, "me");
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "me", type: "ACCESS", status: "COMPLETED" }) });
  });

  it("is NOT_FOUND, with no request recorded, when there is no such account", async () => {
    create.mockClear();
    exporter.buildUserDataExport.mockResolvedValue(null);
    expect(await exportMyDataStep(db, me)).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("setWeightSlidersStep", () => {
  it("saves the three sliders on the caller's own profile", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const result = await setWeightSlidersStep({ profile: { updateMany } } as never, me, { classes: 1.5, interests: 0.5, freeTime: 1 });
    expect(result).toEqual({ status: "saved" });
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: "me" }, data: { weightClasses: 1.5, weightInterests: 0.5, weightFreeTime: 1 } });
  });

  it("is NO_PROFILE when there is no profile yet", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    expect(await setWeightSlidersStep({ profile: { updateMany } } as never, me, { classes: 1, interests: 1, freeTime: 1 })).toEqual({ status: "error", code: "NO_PROFILE" });
  });
});
