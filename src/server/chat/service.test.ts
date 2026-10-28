import { describe, expect, it, vi } from "vitest";
import { reviveConversationStep, sendMessageStep, type ReviveConversationDb, type SendMessageDb } from "./service";

type FakeMatch = {
  id: string;
  status: "ACTIVE" | "UNMATCHED";
  userAId: string;
  userBId: string;
  userA: { profile: { firstName: string; photos: never[] } };
  userB: { profile: { firstName: string; photos: never[] } };
};

const BASE_MATCH: FakeMatch = {
  id: "match-1",
  status: "ACTIVE",
  userAId: "me",
  userBId: "them",
  userA: { profile: { firstName: "Me", photos: [] } },
  userB: { profile: { firstName: "Them", photos: [] } },
};

function fakeDb(options: {
  conversation?: { id: string; status: "ACTIVE" | "EXPIRED"; revivedAt: Date | null; match: FakeMatch } | null;
  blocked?: boolean;
}) {
  const {
    conversation = { id: "c1", status: "ACTIVE", revivedAt: null, match: BASE_MATCH },
    blocked = false,
  } = options;
  const messageCreate = vi.fn(async () => ({ id: "m1", senderId: "me", text: "hi", createdAt: new Date("2026-10-28T00:00:00Z") }));
  const conversationUpdate = vi.fn(async () => ({}));
  const findUnique = vi.fn(async () => conversation);
  const blockFindFirst = vi.fn(async () => (blocked ? { id: "b1" } : null));

  const db = {
    conversation: { findUnique, update: conversationUpdate },
    message: { create: messageCreate },
    block: { findFirst: blockFindFirst },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  } as unknown as SendMessageDb & ReviveConversationDb;

  return { db, messageCreate, conversationUpdate, findUnique };
}

describe("sendMessageStep", () => {
  it("is NOT_FOUND for a conversation that does not exist, or the caller is not part of", async () => {
    for (const conversation of [null, { id: "c1", status: "ACTIVE" as const, revivedAt: null, match: { ...BASE_MATCH, userAId: "other", userBId: "another" } }]) {
      const { db, messageCreate } = fakeDb({ conversation });
      expect(await sendMessageStep(db, { userId: "me" }, "c1", "hi")).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(messageCreate).not.toHaveBeenCalled();
    }
  });

  it("is NOT_FOUND when the two participants have blocked each other, and writes nothing", async () => {
    const { db, messageCreate } = fakeDb({ blocked: true });
    expect(await sendMessageStep(db, { userId: "me" }, "c1", "hi")).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("is UNMATCHED once the match has ended, and writes nothing", async () => {
    const { db, messageCreate } = fakeDb({
      conversation: { id: "c1", status: "ACTIVE", revivedAt: null, match: { ...BASE_MATCH, status: "UNMATCHED" } },
    });
    expect(await sendMessageStep(db, { userId: "me" }, "c1", "hi")).toEqual({ status: "error", code: "UNMATCHED" });
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("is EXPIRED for a silent conversation that has not been revived, and writes nothing", async () => {
    const { db, messageCreate } = fakeDb({ conversation: { id: "c1", status: "EXPIRED", revivedAt: null, match: BASE_MATCH } });
    expect(await sendMessageStep(db, { userId: "me" }, "c1", "hi")).toEqual({ status: "error", code: "EXPIRED" });
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it("creates the message and bumps the conversation's lastMessageAt, clearing any nudge", async () => {
    const { db, messageCreate, conversationUpdate } = fakeDb({});
    const result = await sendMessageStep(db, { userId: "me" }, "c1", "hello there");
    expect(result).toEqual({
      status: "sent",
      message: { id: "m1", senderId: "me", text: "hi", createdAt: new Date("2026-10-28T00:00:00Z") },
    });
    expect(messageCreate).toHaveBeenCalledWith({ data: { conversationId: "c1", senderId: "me", text: "hello there" } });
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { lastMessageAt: expect.any(Date), nudgedAt: null },
    });
  });
});

describe("reviveConversationStep", () => {
  it("is NOT_FOUND for a conversation that does not exist, or the caller is not part of", async () => {
    const { db, conversationUpdate } = fakeDb({ conversation: null });
    expect(await reviveConversationStep(db, { userId: "me" }, "c1")).toEqual({ status: "error", code: "NOT_FOUND" });
    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("is UNMATCHED once the match has ended", async () => {
    const { db, conversationUpdate } = fakeDb({
      conversation: { id: "c1", status: "EXPIRED", revivedAt: null, match: { ...BASE_MATCH, status: "UNMATCHED" } },
    });
    expect(await reviveConversationStep(db, { userId: "me" }, "c1")).toEqual({ status: "error", code: "UNMATCHED" });
    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("is NOT_EXPIRED for a conversation that is still active", async () => {
    const { db, conversationUpdate } = fakeDb({});
    expect(await reviveConversationStep(db, { userId: "me" }, "c1")).toEqual({ status: "error", code: "NOT_EXPIRED" });
    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("is ALREADY_REVIVED once the one revive has been used", async () => {
    const { db, conversationUpdate } = fakeDb({
      conversation: { id: "c1", status: "EXPIRED", revivedAt: new Date("2026-10-20T00:00:00Z"), match: BASE_MATCH },
    });
    expect(await reviveConversationStep(db, { userId: "me" }, "c1")).toEqual({ status: "error", code: "ALREADY_REVIVED" });
    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("reactivates an expired, never-revived conversation", async () => {
    const { db, conversationUpdate } = fakeDb({ conversation: { id: "c1", status: "EXPIRED", revivedAt: null, match: BASE_MATCH } });
    expect(await reviveConversationStep(db, { userId: "me" }, "c1")).toEqual({ status: "revived" });
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "ACTIVE", revivedAt: expect.any(Date), lastMessageAt: expect.any(Date) },
    });
  });
});
