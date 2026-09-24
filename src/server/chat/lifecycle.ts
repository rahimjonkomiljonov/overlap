import type { PrismaClient } from "@/generated/prisma/client";
import { sendEmail } from "@/server/email/send";

/** REQUIREMENTS.md D5: "nudge if silent 72h; expire at 7 days with one revive." */
export const NUDGE_SILENT_HOURS = 72;
export const EXPIRE_SILENT_DAYS = 7;

export type ChatLifecycleDb = Pick<PrismaClient, "conversation">;

interface NudgeableConversation {
  id: string;
  userAEmail: string;
  userBEmail: string;
}

/** ACTIVE conversations silent ≥72h that haven't been nudged for this silent stretch yet. */
export async function findConversationsToNudge(db: ChatLifecycleDb, now: Date = new Date()): Promise<NudgeableConversation[]> {
  const cutoff = new Date(now.getTime() - NUDGE_SILENT_HOURS * 60 * 60 * 1000);
  const conversations = await db.conversation.findMany({
    where: { status: "ACTIVE", lastMessageAt: { lte: cutoff }, nudgedAt: null },
    select: {
      id: true,
      match: { select: { userA: { select: { email: true } }, userB: { select: { email: true } } } },
    },
  });
  return conversations.map((c) => ({ id: c.id, userAEmail: c.match.userA.email, userBEmail: c.match.userB.email }));
}

/**
 * Sends both participants a plain-text nudge (the same console/outbox-fallback
 * `sendEmail()` OTP already uses — S18 is where nicer templates land) and clears the
 * conversation's silence clock's nudge flag. Notifies both sides rather than trying to
 * guess who "owes" a reply, which needs no message-ordering logic to get right.
 * `sendEmail` is injectable, mirroring `purgeSelfies`' `deleteFile` — see lifecycle.test.ts.
 */
export async function sendSilenceNudges(
  db: ChatLifecycleDb,
  options: { now?: Date; sendEmail?: typeof sendEmail } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const send = options.sendEmail ?? sendEmail;
  const toNudge = await findConversationsToNudge(db, now);

  for (const conversation of toNudge) {
    for (const email of [conversation.userAEmail, conversation.userBEmail]) {
      await send({
        to: email,
        subject: "Overlap: your conversation has gone quiet",
        text: "It's been a few days since you last messaged your match on Overlap. Say hi before it expires!",
      });
    }
    await db.conversation.update({ where: { id: conversation.id }, data: { nudgedAt: now } });
  }

  return toNudge.length;
}

/** ACTIVE conversations silent ≥7 days — eligible to expire regardless of past nudges or revives. */
export async function findConversationsToExpire(db: ChatLifecycleDb, now: Date = new Date()): Promise<{ id: string }[]> {
  const cutoff = new Date(now.getTime() - EXPIRE_SILENT_DAYS * 24 * 60 * 60 * 1000);
  return db.conversation.findMany({
    where: { status: "ACTIVE", lastMessageAt: { lte: cutoff } },
    select: { id: true },
  });
}

/** Marks silent-7-day conversations EXPIRED. `revivedAt` (the "one revive" cap) is untouched here — only the revive action itself ever sets it. */
export async function expireSilentConversations(db: ChatLifecycleDb, options: { now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const toExpire = await findConversationsToExpire(db, now);

  for (const conversation of toExpire) {
    await db.conversation.update({ where: { id: conversation.id }, data: { status: "EXPIRED", expiredAt: now } });
  }

  return toExpire.length;
}
