import type { PrismaClient } from "@/generated/prisma/client";
import { MeetupStatus } from "@/generated/prisma/enums";

export type MeetupSummaryDb = Pick<PrismaClient, "meetProposal">;

/**
 * What the chat and the matches list show about a match's meetup, from one person's point
 * of view: waiting for an answer (yellow dot), confirmed (green), or declined (red, only to
 * the person whose suggestion it was, and only until they have looked). `unseen` is true
 * while this person has not opened the meetup since the status last changed; that is what
 * makes the dot blink. Dates are ISO strings so the value crosses the server/client
 * boundary (and the /api/matches JSON) unchanged.
 */
export interface ActiveMeetupSummary {
  status: "PROPOSED" | "ACCEPTED" | "DECLINED";
  unseen: boolean;
  proposedByUserId: string;
  start: string;
  end: string;
  spotName: string;
  spotNameEn: string | null;
}

export interface MeetupSummaryRow {
  matchId: string;
  status: MeetupStatus;
  proposedByUserId: string;
  respondedByUserId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  createdAt: Date;
  proposerSeenStatus: MeetupStatus | null;
  responderSeenStatus: MeetupStatus | null;
  spot: { name: string; nameEn: string | null };
}

/**
 * The pure part: for each match, the one proposal to show this viewer. A live one (waiting
 * or confirmed and not over) wins, soonest first. Failing that, a decline of the viewer's
 * own suggestion by the other person that the viewer has not seen yet. Anything else shows
 * nothing.
 */
export function summarizeMeetups(
  rows: MeetupSummaryRow[],
  viewerId: string,
  now: Date,
): Map<string, ActiveMeetupSummary> {
  const byMatch = new Map<string, MeetupSummaryRow[]>();
  for (const row of rows) byMatch.set(row.matchId, [...(byMatch.get(row.matchId) ?? []), row]);

  const result = new Map<string, ActiveMeetupSummary>();
  for (const [matchId, matchRows] of byMatch) {
    const live = matchRows
      .filter(
        (r) =>
          (r.status === MeetupStatus.PROPOSED || r.status === MeetupStatus.ACCEPTED) &&
          r.scheduledEnd.getTime() > now.getTime(),
      )
      .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())[0];

    const declined = matchRows
      .filter(
        (r) =>
          r.status === MeetupStatus.DECLINED &&
          r.proposedByUserId === viewerId &&
          r.respondedByUserId !== null &&
          r.respondedByUserId !== viewerId &&
          r.proposerSeenStatus !== MeetupStatus.DECLINED,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const chosen = live ?? declined;
    if (!chosen) continue;

    const seen = chosen.proposedByUserId === viewerId ? chosen.proposerSeenStatus : chosen.responderSeenStatus;
    result.set(matchId, {
      status: chosen.status as "PROPOSED" | "ACCEPTED" | "DECLINED",
      unseen: seen !== chosen.status,
      proposedByUserId: chosen.proposedByUserId,
      start: chosen.scheduledStart.toISOString(),
      end: chosen.scheduledEnd.toISOString(),
      spotName: chosen.spot.name,
      spotNameEn: chosen.spot.nameEn,
    });
  }
  return result;
}

/** One query for any number of matches; a match with nothing to show is simply absent from the map. */
export async function getActiveMeetups(
  db: MeetupSummaryDb,
  matchIds: string[],
  viewerId: string,
  now: Date = new Date(),
): Promise<Map<string, ActiveMeetupSummary>> {
  if (matchIds.length === 0) return new Map();

  const rows = await db.meetProposal.findMany({
    where: {
      matchId: { in: matchIds },
      OR: [
        { status: { in: [MeetupStatus.PROPOSED, MeetupStatus.ACCEPTED] }, scheduledEnd: { gt: now } },
        {
          // A decline the proposer has not looked at yet. NULL has to be named explicitly:
          // SQL's "<> 'DECLINED'" is never true for a NULL.
          status: MeetupStatus.DECLINED,
          proposedByUserId: viewerId,
          OR: [{ proposerSeenStatus: null }, { proposerSeenStatus: { not: MeetupStatus.DECLINED } }],
        },
      ],
    },
    select: {
      matchId: true,
      status: true,
      proposedByUserId: true,
      respondedByUserId: true,
      scheduledStart: true,
      scheduledEnd: true,
      createdAt: true,
      proposerSeenStatus: true,
      responderSeenStatus: true,
      spot: { select: { name: true, nameEn: true } },
    },
  });

  return summarizeMeetups(rows, viewerId, now);
}
