import { describe, expect, it } from "vitest";
import { findAndQueueUnreadMessageNotifications, UNREAD_MESSAGE_DELAY_HOURS, type UnreadMessageDb } from "./unread";

interface FakeConversationRow {
  id: string;
  status: "ACTIVE" | "EXPIRED";
  userAId: string;
  userBId: string;
  lastMessage: { id: string; senderId: string; createdAt: Date } | null;
}

function fakeDb(rows: FakeConversationRow[]) {
  const queued: { userId: string; type: string; dedupeKey: string; data?: unknown }[] = [];
  const seenKeys = new Set<string>();

  const db: UnreadMessageDb = {
    conversation: {
      findMany: async ({ where }: { where: { status: string } }) =>
        rows
          .filter((r) => r.status === where.status)
          .map((r) => ({
            id: r.id,
            match: { userAId: r.userAId, userBId: r.userBId },
            messages: r.lastMessage ? [r.lastMessage] : [],
          })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    notification: {
      upsert: async ({
        where,
        create,
      }: {
        where: { dedupeKey: string };
        create: { userId: string; type: string; dedupeKey: string; data?: unknown };
      }) => {
        if (!seenKeys.has(where.dedupeKey)) {
          seenKeys.add(where.dedupeKey);
          queued.push(create);
        }
        return {} as never;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
  return { db, queued };
}

const NOW = new Date("2026-09-26T12:00:00.000Z");
const ONE_HOUR_AGO = new Date(NOW.getTime() - UNREAD_MESSAGE_DELAY_HOURS * 60 * 60 * 1000);

describe("constants", () => {
  it("matches BUILD_PLAN S18's 1h delay", () => {
    expect(UNREAD_MESSAGE_DELAY_HOURS).toBe(1);
  });
});

describe("findAndQueueUnreadMessageNotifications", () => {
  it("queues the non-sender when the last message is exactly 1h old", async () => {
    const { db, queued } = fakeDb([
      {
        id: "conv1",
        status: "ACTIVE",
        userAId: "alice",
        userBId: "bob",
        lastMessage: { id: "m1", senderId: "alice", createdAt: ONE_HOUR_AGO },
      },
    ]);
    const count = await findAndQueueUnreadMessageNotifications(db, NOW);
    expect(count).toBe(1);
    expect(queued).toEqual([
      { userId: "bob", type: "UNREAD_MESSAGE", dedupeKey: "unread-message:m1:bob", data: { conversationId: "conv1", messageId: "m1" } },
    ]);
  });

  it("does not queue a message less than 1h old", async () => {
    const recent = new Date(NOW.getTime() - 30 * 60 * 1000);
    const { db, queued } = fakeDb([
      { id: "conv1", status: "ACTIVE", userAId: "alice", userBId: "bob", lastMessage: { id: "m1", senderId: "alice", createdAt: recent } },
    ]);
    const count = await findAndQueueUnreadMessageNotifications(db, NOW);
    expect(count).toBe(0);
    expect(queued).toEqual([]);
  });

  it("skips a conversation with no messages", async () => {
    const { db, queued } = fakeDb([
      { id: "conv1", status: "ACTIVE", userAId: "alice", userBId: "bob", lastMessage: null },
    ]);
    const count = await findAndQueueUnreadMessageNotifications(db, NOW);
    expect(count).toBe(0);
    expect(queued).toEqual([]);
  });

  it("is idempotent: a second run for the same still-unread message doesn't double-queue", async () => {
    const { db, queued } = fakeDb([
      { id: "conv1", status: "ACTIVE", userAId: "alice", userBId: "bob", lastMessage: { id: "m1", senderId: "alice", createdAt: ONE_HOUR_AGO } },
    ]);
    await findAndQueueUnreadMessageNotifications(db, NOW);
    await findAndQueueUnreadMessageNotifications(db, NOW);
    expect(queued).toHaveLength(1);
  });

  it("resolves the recipient as whichever side did not send the last message", async () => {
    const { db, queued } = fakeDb([
      { id: "conv1", status: "ACTIVE", userAId: "alice", userBId: "bob", lastMessage: { id: "m1", senderId: "bob", createdAt: ONE_HOUR_AGO } },
    ]);
    await findAndQueueUnreadMessageNotifications(db, NOW);
    expect(queued[0].userId).toBe("alice");
  });
});
