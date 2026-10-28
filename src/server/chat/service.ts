import type { PrismaClient } from "@/generated/prisma/client";
import { broadcastNewMessage } from "./realtime";
import { getConversationForActor, type ChatDb, type ChatMessage } from "./queries";

export type SendMessageDb = Pick<PrismaClient, "conversation" | "message" | "block" | "$transaction">;

export type SendMessageResult =
  | { status: "sent"; message: ChatMessage }
  | { status: "error"; code: "NOT_FOUND" | "UNMATCHED" | "EXPIRED" };

/**
 * Sends a message in an already-matched conversation. Shared by the website's `sendMessage`
 * action and the mobile `POST /chat/{id}/messages` route — each applies its own abuse
 * rate-limit first (a surface-specific concern, not a business rule), then calls this.
 */
export async function sendMessageStep(
  db: SendMessageDb,
  person: { userId: string },
  conversationId: string,
  text: string,
): Promise<SendMessageResult> {
  const conversation = await getConversationForActor(db, conversationId, person.userId);
  if (!conversation) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (conversation.matchStatus !== "ACTIVE") {
    return { status: "error", code: "UNMATCHED" };
  }
  if (conversation.status !== "ACTIVE") {
    return { status: "error", code: "EXPIRED" };
  }

  const now = new Date();
  const [created] = await db.$transaction([
    db.message.create({
      data: { conversationId: conversation.conversationId, senderId: person.userId, text },
    }),
    db.conversation.update({
      where: { id: conversation.conversationId },
      data: { lastMessageAt: now, nudgedAt: null },
    }),
  ]);

  const message: ChatMessage = { id: created.id, senderId: created.senderId, text: created.text, createdAt: created.createdAt };
  await broadcastNewMessage(conversation.conversationId, message);

  return { status: "sent", message };
}

export type ReviveConversationDb = ChatDb;

export type ReviveConversationResult =
  | { status: "revived" }
  | { status: "error"; code: "NOT_FOUND" | "UNMATCHED" | "NOT_EXPIRED" | "ALREADY_REVIVED" };

/** D5's "one revive": refuses if this conversation has already been revived once, or isn't actually expired, or the match has since been unmatched. Shared by the website's `reviveConversation` action and the mobile `POST /chat/{id}/revive` route. */
export async function reviveConversationStep(
  db: ReviveConversationDb,
  person: { userId: string },
  conversationId: string,
): Promise<ReviveConversationResult> {
  const conversation = await getConversationForActor(db, conversationId, person.userId);
  if (!conversation) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (conversation.matchStatus !== "ACTIVE") {
    return { status: "error", code: "UNMATCHED" };
  }
  if (conversation.status !== "EXPIRED") {
    return { status: "error", code: "NOT_EXPIRED" };
  }
  if (conversation.revivedAt !== null) {
    return { status: "error", code: "ALREADY_REVIVED" };
  }

  const now = new Date();
  await db.conversation.update({
    where: { id: conversation.conversationId },
    data: { status: "ACTIVE", revivedAt: now, lastMessageAt: now },
  });

  return { status: "revived" };
}
