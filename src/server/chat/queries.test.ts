import { describe, expect, it, vi } from "vitest";
import { getConversationForActor, type ChatDb } from "./queries";

function fakeDb(options: { otherStatus?: "ACTIVE" | "DELETED"; blocked?: boolean } = {}) {
  const { otherStatus = "ACTIVE", blocked = false } = options;
  const db = {
    conversation: {
      findUnique: vi.fn(async () => ({
        id: "c1",
        status: "ACTIVE",
        revivedAt: null,
        match: {
          id: "m1",
          status: "ACTIVE",
          userAId: "me",
          userBId: "them",
          userA: { status: "ACTIVE", profile: { firstName: "Me", photos: [] } },
          userB: { status: otherStatus, profile: { firstName: "Them", photos: [] } },
        },
      })),
    },
    block: { findFirst: vi.fn(async () => (blocked ? { id: "b" } : null)) },
    message: { findMany: vi.fn(async () => []) },
  } as unknown as ChatDb;
  return db;
}

describe("getConversationForActor", () => {
  it("opens a conversation with an active person", async () => {
    expect(await getConversationForActor(fakeDb(), "c1", "me")).toMatchObject({ conversationId: "c1", otherUserId: "them", canInteract: true });
  });

  it("is null for someone who is not part of it", async () => {
    expect(await getConversationForActor(fakeDb(), "c1", "stranger")).toBeNull();
  });

  it("is null once the other person's account is deleted, exactly like a block, so a guessed id cannot tell them apart", async () => {
    expect(await getConversationForActor(fakeDb({ otherStatus: "DELETED" }), "c1", "me")).toBeNull();
    expect(await getConversationForActor(fakeDb({ blocked: true }), "c1", "me")).toBeNull();
  });
});
