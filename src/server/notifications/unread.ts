import type { PrismaClient } from "@/generated/prisma/client";
import { enqueueNotification } from "./queue";

/** BUILD_PLAN S18: "unread message after 1 h." */
export const UNREAD_MESSAGE_DELAY_HOURS = 1;

export type UnreadMessageDb = Pick<PrismaClient, "conversation" | "notification">;

/**
 * Finds each ACTIVE conversation's most recent message and, when it's ≥1h old and the
 * recipient (whichever side didn't send it) hasn't replied since, queues an
 * UNREAD_MESSAGE notification for them. There's no read-receipt anywhere in this
 * schema (S15 deferred it), so "still unread" is a proxy: no reply from the recipient
 * after the message's own createdAt. Idempotent via enqueueNotification's dedupeKey
 * (keyed on this exact message + this exact recipient), so re-running this on every
 * cron tick — the only way to catch "1h has now passed" without a per-message timer —
 * never double-queues the same event.
 */
export async function findAndQueueUnreadMessageNotifications(
  db: UnreadMessageDb,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - UNREAD_MESSAGE_DELAY_HOURS * 60 * 60 * 1000);

  const conversations = await db.conversation.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      match: { select: { userAId: true, userBId: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, senderId: true, createdAt: true } },
    },
  });

  let queued = 0;
  for (const conversation of conversations) {
    const last = conversation.messages[0];
    if (!last || last.createdAt > cutoff) continue;

    const recipientId =
      last.senderId === conversation.match.userAId ? conversation.match.userBId : conversation.match.userAId;

    await enqueueNotification(db, {
      userId: recipientId,
      type: "UNREAD_MESSAGE",
      dedupeKey: `unread-message:${last.id}:${recipientId}`,
      data: { conversationId: conversation.id, messageId: last.id },
    });
    queued++;
  }

  return queued;
}
