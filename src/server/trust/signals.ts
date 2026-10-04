import type { PrismaClient } from "@/generated/prisma/client";
import { MIN_REPORTER_ACCOUNT_AGE_DAYS, NO_SIGNALS, TRUST_WINDOW_DAYS, type TrustSignals } from "./score";

export type TrustSignalsDb = Pick<PrismaClient, "report" | "moderationAction" | "meetupFeedbackEntry">;

/**
 * G10 signals for many users in three bulk queries (one per signal), so the matching
 * pool can load them for a whole campus at once. Only counts leave this function.
 */
export async function loadTrustSignals(
  db: TrustSignalsDb,
  userIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, TrustSignals>> {
  const result = new Map<string, TrustSignals>();
  if (userIds.length === 0) return result;
  const ids = [...userIds];
  const since = new Date(now.getTime() - TRUST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [reports, warnings, feedback] = await Promise.all([
    db.report.findMany({
      where: {
        targetId: { in: ids },
        createdAt: { gte: since },
        // A moderator's dismissal means the report doesn't count against anyone.
        actions: { none: { type: "DISMISS" } },
        // Only verified reporters count; their account age is checked below.
        reporter: { verifiedAt: { not: null } },
      },
      select: { targetId: true, reporterId: true, createdAt: true, reporter: { select: { createdAt: true } } },
    }),
    db.moderationAction.findMany({
      where: { targetId: { in: ids }, type: "WARN", createdAt: { gte: since } },
      select: { targetId: true },
    }),
    db.meetupFeedbackEntry.findMany({
      where: {
        response: "UNCOMFORTABLE",
        createdAt: { gte: since },
        proposal: { match: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } },
      },
      select: { userId: true, proposal: { select: { match: { select: { userAId: true, userBId: true } } } } },
    }),
  ]);

  const get = (id: string) => {
    if (!result.has(id)) result.set(id, { ...NO_SIGNALS });
    return result.get(id)!;
  };

  // Against coordinated reporting from fresh accounts: the reporter's account must have
  // been at least a week old when they filed. (Prisma can't compare two columns, so here.)
  const minAgeMs = MIN_REPORTER_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
  const counted = reports.filter((r) => r.createdAt.getTime() - r.reporter.createdAt.getTime() >= minAgeMs);
  const reporterPairs = new Set(counted.map((r) => `${r.targetId}:${r.reporterId}`));
  for (const pair of reporterPairs) get(pair.split(":")[0]).reporters++;

  for (const w of warnings) get(w.targetId).warnings++;

  // The feedback is about the other person in that match, counted once per giver.
  const wanted = new Set(ids);
  const feedbackPairs = new Set<string>();
  for (const entry of feedback) {
    const { userAId, userBId } = entry.proposal.match;
    const subject = entry.userId === userAId ? userBId : userAId;
    if (wanted.has(subject)) feedbackPairs.add(`${subject}:${entry.userId}`);
  }
  for (const pair of feedbackPairs) get(pair.split(":")[0]).uncomfortableMeetups++;

  return result;
}
