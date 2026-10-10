import type { NotificationType, PrismaClient } from "@/generated/prisma/client";
import { sendEmail } from "@/server/email/send";
import { isSeoulQuietHours } from "@/server/matching/seoul-date";
import { sendPush } from "@/server/push/send";
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

export type ProcessQueueDb = Pick<PrismaClient, "notification" | "message" | "pushSubscription">;

/** Where tapping a push notification lands, per type; English lives under /en. */
const PUSH_PATHS: Record<NotificationType, string> = {
  MATCH: "/matches",
  WAVE_RECEIVED: "/waves",
  UNREAD_MESSAGE: "/matches",
  MODERATION_ACTION: "/me/safety",
};

function pushUrl(type: NotificationType, locale: NotificationLocale): string {
  return locale === "en" ? `/en${PUSH_PATHS[type]}` : PUSH_PATHS[type];
}

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
  options: { now?: Date; sendEmail?: typeof sendEmail; sendPush?: typeof sendPush } = {},
): Promise<{ sent: number; skipped: number; deferred: boolean; pushed: number }> {
  const now = options.now ?? new Date();
  const send = options.sendEmail ?? sendEmail;
  const push = options.sendPush ?? sendPush;

  if (isSeoulQuietHours(now)) {
    return { sent: 0, skipped: 0, deferred: true, pushed: 0 };
  }

  const queued = await db.notification.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { email: true, pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } } } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let pushed = 0;

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

    const locale = notification.locale as NotificationLocale;
    const { subject, text } = renderNotificationEmail(notification.type, locale, notification.data);
    await send({ to: notification.user.email, subject, text });

    // Same quiet hours and the same generic text as the email; a push failure never
    // holds back the email or the rest of the queue.
    for (const subscription of notification.user.pushSubscriptions ?? []) {
      const result = await push(subscription, { title: subject, body: text, url: pushUrl(notification.type, locale) });
      if (result === "sent" || result === "logged") pushed++;
      if (result === "gone") {
        await db.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
      }
    }

    await db.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: now } });
    sent++;
  }

  return { sent, skipped, deferred: false, pushed };
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
