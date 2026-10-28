import { beforeEach, describe, expect, it, vi } from "vitest";

const trust = vi.hoisted(() => ({ getMyTrustStatus: vi.fn() }));
vi.mock("@/server/trust/queries", () => trust);

import {
  blockUserStep,
  fileReportStep,
  hideByClubStep,
  hideByCourseStep,
  hideByEmailStep,
  setIncognitoStep,
  setPausedStep,
  submitAppealStep,
  submitTrustAppealStep,
  unblockUserStep,
  unhideStep,
  type SafetyWriteDb,
} from "./service";

const me = { userId: "me" };

describe("blockUserStep", () => {
  const fake = (exists = true) => {
    const upsert = vi.fn(async () => ({}));
    return { upsert, db: { user: { findUnique: vi.fn(async () => (exists ? { id: "them" } : null)) }, block: { upsert } } as never };
  };

  it("refuses to block yourself, and a person who does not exist, and writes nothing", async () => {
    const self = fake();
    expect(await blockUserStep(self.db, me, { targetUserId: "me" })).toEqual({ status: "error", code: "CANNOT_BLOCK_SELF" });
    const missing = fake(false);
    expect(await blockUserStep(missing.db, me, { targetUserId: "them" })).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(self.upsert).not.toHaveBeenCalled();
    expect(missing.upsert).not.toHaveBeenCalled();
  });

  it("blocks, with the reason when given, and blocking twice is harmless", async () => {
    const { db, upsert } = fake();
    expect(await blockUserStep(db, me, { targetUserId: "them", reason: "rude" })).toEqual({ status: "blocked" });
    expect(upsert).toHaveBeenCalledWith({
      where: { blockerId_blockedId: { blockerId: "me", blockedId: "them" } },
      update: {},
      create: { blockerId: "me", blockedId: "them", reason: "rude" },
    });
  });

  it("unblocks only the caller's own block", async () => {
    const deleteMany = vi.fn(async () => ({}));
    expect(await unblockUserStep({ block: { deleteMany } } as never, me, "them")).toEqual({ status: "unblocked" });
    expect(deleteMany).toHaveBeenCalledWith({ where: { blockerId: "me", blockedId: "them" } });
  });
});

describe("setPausedStep and setIncognitoStep", () => {
  it("pauses and unpauses an active or paused account", async () => {
    for (const status of ["ACTIVE", "PAUSED"] as const) {
      const update = vi.fn(async () => ({}));
      expect(await setPausedStep({ user: { update } } as never, { userId: "me", status }, true)).toEqual({ status: "saved" });
      expect(update).toHaveBeenCalledWith({ where: { id: "me" }, data: { status: "PAUSED" } });
    }
    const update = vi.fn(async () => ({}));
    await setPausedStep({ user: { update } } as never, { userId: "me", status: "PAUSED" }, false);
    expect(update).toHaveBeenCalledWith({ where: { id: "me" }, data: { status: "ACTIVE" } });
  });

  it("never lets a suspended or banned account change its own status", async () => {
    for (const status of ["SUSPENDED", "BANNED"] as const) {
      const update = vi.fn(async () => ({}));
      expect(await setPausedStep({ user: { update } } as never, { userId: "me", status }, false)).toEqual({ status: "error", code: "ACCOUNT_RESTRICTED" });
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("sets incognito on the caller's own profile", async () => {
    const update = vi.fn(async () => ({}));
    expect(await setIncognitoStep({ profile: { update } } as never, me, true)).toEqual({ status: "saved" });
    expect(update).toHaveBeenCalledWith({ where: { userId: "me" }, data: { incognito: true } });
  });
});

describe("hide-from steps", () => {
  it("hides everyone else in a course or club, one rule per person, never the caller", async () => {
    const createMany = vi.fn(async () => ({ count: 2 }));
    const findMany = vi.fn(async () => [{ profile: { userId: "u1" } }, { profile: { userId: "u2" } }]);
    const result = await hideByCourseStep({ profileCourse: { findMany }, hideRule: { createMany } } as never, me, "c1");
    expect(result).toEqual({ status: "hidden", count: 2 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { courseId: "c1", profile: { userId: { not: "me" } } } }));
    expect(createMany).toHaveBeenCalledWith({ data: [{ userId: "me", hiddenUserId: "u1" }, { userId: "me", hiddenUserId: "u2" }], skipDuplicates: true });
    const clubs = await hideByClubStep({ profileClub: { findMany }, hideRule: { createMany } } as never, me, "k1");
    expect(clubs).toEqual({ status: "hidden", count: 2 });
  });

  it("writes nothing for an empty course", async () => {
    const createMany = vi.fn(async () => ({ count: 0 }));
    const result = await hideByCourseStep({ profileCourse: { findMany: vi.fn(async () => []) }, hideRule: { createMany } } as never, me, "c1");
    expect(result).toEqual({ status: "hidden", count: 0 });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("hides one person by email: 404 for no account, refuses yourself", async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    const db = (found: { id: string } | null) => ({ user: { findUnique: vi.fn(async () => found) }, hideRule: { createMany } }) as never;
    expect(await hideByEmailStep(db(null), me, "x@school.ac.kr")).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(await hideByEmailStep(db({ id: "me" }), me, "me@school.ac.kr")).toEqual({ status: "error", code: "CANNOT_HIDE_SELF" });
    expect(createMany).not.toHaveBeenCalled();
    expect(await hideByEmailStep(db({ id: "them" }), me, "them@school.ac.kr")).toEqual({ status: "hidden", count: 1 });
  });

  it("unhides only the caller's own rule", async () => {
    const deleteMany = vi.fn(async () => ({}));
    expect(await unhideStep({ hideRule: { deleteMany } } as never, me, "them")).toEqual({ status: "unhidden" });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "me", hiddenUserId: "them" } });
  });
});

describe("fileReportStep", () => {
  function fake(options: { target?: boolean; conversation?: { otherUserId?: string; participant?: boolean; blocked?: boolean } | null } = {}) {
    const { target = true, conversation = null } = options;
    const reportCreate = vi.fn(async () => ({}));
    const hideUpsert = vi.fn(async () => ({}));
    const tx = { report: { create: reportCreate }, hideRule: { upsert: hideUpsert } };
    const db = {
      user: { findUnique: vi.fn(async () => (target ? { id: "them" } : null)) },
      conversation: {
        findUnique: vi.fn(async () =>
          conversation === null
            ? null
            : {
                id: "c1",
                status: "ACTIVE",
                revivedAt: null,
                match: {
                  id: "m1",
                  status: "ACTIVE",
                  userAId: conversation.participant === false ? "x" : "me",
                  userBId: conversation.otherUserId ?? "them",
                  userA: { profile: { firstName: "Me", photos: [] } },
                  userB: { profile: { firstName: "Them", photos: [] } },
                },
              },
        ),
      },
      block: { findFirst: vi.fn(async () => (conversation?.blocked ? { id: "b" } : null)) },
      message: {
        findMany: vi.fn(async () => [
          { id: "1", senderId: "them", text: "hello", createdAt: new Date("2026-10-28T00:00:00Z") },
          { id: "2", senderId: "me", text: "no", createdAt: new Date("2026-10-28T00:01:00Z") },
        ]),
      },
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as SafetyWriteDb;
    return { db, reportCreate, hideUpsert };
  }

  it("refuses to report yourself or a person who does not exist, and writes nothing", async () => {
    const a = fake();
    expect(await fileReportStep(a.db, me, { targetUserId: "me", category: "SPAM" })).toEqual({ status: "error", code: "CANNOT_REPORT_SELF" });
    const b = fake({ target: false });
    expect(await fileReportStep(b.db, me, { targetUserId: "them", category: "SPAM" })).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(a.reportCreate).not.toHaveBeenCalled();
    expect(b.reportCreate).not.toHaveBeenCalled();
  });

  it("files the report and hides the person from the reporter in the same transaction", async () => {
    const { db, reportCreate, hideUpsert } = fake();
    expect(await fileReportStep(db, me, { targetUserId: "them", category: "HARASSMENT", description: "rude" })).toEqual({ status: "filed" });
    expect(reportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ reporterId: "me", targetId: "them", category: "HARASSMENT", description: "rude", conversationId: null, evidence: undefined }),
    });
    expect(hideUpsert).toHaveBeenCalledWith({
      where: { userId_hiddenUserId: { userId: "me", hiddenUserId: "them" } },
      update: {},
      create: { userId: "me", hiddenUserId: "them" },
    });
  });

  it("attaches the conversation's messages as evidence only when it is the reporter's own chat with that person", async () => {
    const ok = fake({ conversation: {} });
    expect(await fileReportStep(ok.db, me, { targetUserId: "them", category: "HARASSMENT", conversationId: "c1" })).toEqual({ status: "filed" });
    expect(ok.reportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "c1",
        evidence: [
          { senderId: "them", text: "hello", createdAt: "2026-10-28T00:00:00.000Z" },
          { senderId: "me", text: "no", createdAt: "2026-10-28T00:01:00.000Z" },
        ],
      }),
    });
    for (const conversation of [null, { participant: false }, { otherUserId: "someone-else" }, { blocked: true }]) {
      const bad = fake({ conversation });
      expect(await fileReportStep(bad.db, me, { targetUserId: "them", category: "HARASSMENT", conversationId: "c1" })).toEqual({ status: "error", code: "INVALID_CONVERSATION" });
      expect(bad.reportCreate).not.toHaveBeenCalled();
      expect(bad.hideUpsert).not.toHaveBeenCalled();
    }
  });
});

describe("submitAppealStep", () => {
  const fake = (action: { id: string; targetId: string; appealedAt: Date | null } | null) => {
    const update = vi.fn(async () => ({}));
    return { update, db: { moderationAction: { findUnique: vi.fn(async () => action), update } } as never };
  };
  const input = { moderationActionId: "a1", appealNote: "this was a mistake" };

  it("is NOT_FOUND for someone else's action, or one that does not exist", async () => {
    for (const action of [null, { id: "a1", targetId: "other", appealedAt: null }]) {
      const { db, update } = fake(action);
      expect(await submitAppealStep(db, me, input)).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("allows one appeal only", async () => {
    const { db, update } = fake({ id: "a1", targetId: "me", appealedAt: new Date() });
    expect(await submitAppealStep(db, me, input)).toEqual({ status: "error", code: "ALREADY_APPEALED" });
    expect(update).not.toHaveBeenCalled();
  });

  it("records the note and the time", async () => {
    const { db, update } = fake({ id: "a1", targetId: "me", appealedAt: null });
    expect(await submitAppealStep(db, me, input)).toEqual({ status: "submitted" });
    expect(update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { appealNote: "this was a mistake", appealedAt: expect.any(Date) } });
  });
});

describe("submitTrustAppealStep", () => {
  beforeEach(() => trust.getMyTrustStatus.mockReset());
  const fake = () => {
    const create = vi.fn(async () => ({}));
    return { create, db: { trustAppeal: { create } } as never };
  };

  it("needs an actual limit, and only one open appeal at a time", async () => {
    const a = fake();
    trust.getMyTrustStatus.mockResolvedValue({ limited: false, openAppeal: null });
    expect(await submitTrustAppealStep(a.db, me, "please")).toEqual({ status: "error", code: "NOT_LIMITED" });
    trust.getMyTrustStatus.mockResolvedValue({ limited: true, openAppeal: { createdAt: new Date() } });
    expect(await submitTrustAppealStep(a.db, me, "please")).toEqual({ status: "error", code: "ALREADY_OPEN" });
    expect(a.create).not.toHaveBeenCalled();
  });

  it("opens an appeal for a limited person", async () => {
    const { db, create } = fake();
    trust.getMyTrustStatus.mockResolvedValue({ limited: true, openAppeal: null });
    expect(await submitTrustAppealStep(db, me, "please")).toEqual({ status: "submitted" });
    expect(create).toHaveBeenCalledWith({ data: { userId: "me", note: "please" } });
  });
});
