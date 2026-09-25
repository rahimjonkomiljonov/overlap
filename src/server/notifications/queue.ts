import type { NotificationType, PrismaClient } from "@/generated/prisma/client";
import { sendEmail } from "@/server/email/send";
import { isSeoulQuietHours } from "@/server/matching/seoul-date";
import { type NotificationLocale, renderNotificationEmail } from "./templates";

export type EnqueueNotificationDb = Pick<PrismaClient, "notification">;

/**
 * Idempotently queues a service notification. Every trigger site (formMatch, sendWave,
 * the unread-message finder) calls this instead of sendEmail() directly — BUILD_PLAN
 * S18: "queued, not dropped." `dedupeKey` makes a repeated call for the same event (a
 * finder job re-running on its next cron tick, or a caller that races) a no-op rather
 * than a duplicate row, via upsert against the unique column.
 */
export async function enqueueNotification(
  db: EnqueueNotificationDb,
  input: { userId: string; type: NotificationType; dedupeKey: string; data?: object },
): Promise<void> {
  await db.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: { userId: input.userId, type: input.type, dedupeKey: input.dedupeKey, data: input.data ?? undefined },
    update: {},
  });
}

export type ProcessQueueDb = Pick<PrismaClient, "notification" | "message">;

interface UnreadMessageData {
  conversationId: string;
  messageId: string;
}

/**
 * Sends every currently-QUEUED notification, unless `now` falls in the 21:00-08:00
 * Seoul quiet-hours window — in that case it sends nothing at all and leaves every row
 * QUEUED exactly as it was, matching BUILD_PLAN S18's "queued, not dropped" literally
 * (not even attempted-then-requeued). Only ever called from the queue's own cron
 * route/CLI (mirroring chat-lifecycle.ts), never from a request handler.
 */
export async function processQueuedNotifications(
  db: ProcessQueueDb,
  options: { now?: Date; sendEmail?: typeof sendEmail } = {},
): Promise<{ sent: number; skipped: number; deferred: boolean }> {
  const now = options.now ?? new Date();
  const send = options.sendEmail ?? sendEmail;

  if (isSeoulQuietHours(now)) {
    return { sent: 0, skipped: 0, deferred: true };
  }

  const queued = await db.notification.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { email: true } } },
  });

  let sent = 0;
  let skipped = 0;

  for (const notification of queued) {
    if (notification.type === "UNREAD_MESSAGE") {
      const stillUnread = await isMessageStillUnread(
        db,
        notification.data as UnreadMessageData | null,
        notification.userId,
      );
      if (!stillUnread) {
        await db.notification.update({ where: { id: notification.id }, data: { status: "SKIPPED" } });
        skipped++;
        continue;
      }
    }

    const { subject, text } = renderNotificationEmail(notification.type, notification.locale as NotificationLocale);
    await send({ to: notification.user.email, subject, text });
    await db.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: now } });
    sent++;
  }

  return { sent, skipped, deferred: false };
}

/**
 * Re-checks "still unread" at send time, not just at queue time — a notification can sit
 * QUEUED for hours through a quiet-hours window, and there's no read-receipt anywhere in
 * this schema to check directly. The only signal available is the same one the
 * unread-message finder used to queue it: has the recipient sent anything in this
 * conversation since the triggering message arrived.
 */
async function isMessageStillUnread(
  db: Pick<PrismaClient, "message">,
  data: UnreadMessageData | null,
  recipientUserId: string,
): Promise<boolean> {
  if (!data) return true;

  const triggerMessage = await db.message.findUnique({
    where: { id: data.messageId },
    select: { createdAt: true },
  });
  if (!triggerMessage) return false;

  const replied = await db.message.findFirst({
    where: {
      conversationId: data.conversationId,
      senderId: recipientUserId,
      createdAt: { gt: triggerMessage.createdAt },
    },
    select: { id: true },
  });
  return !replied;
}
