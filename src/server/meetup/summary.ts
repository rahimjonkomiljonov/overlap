import type { PrismaClient } from "@/generated/prisma/client";
import { MeetupStatus } from "@/generated/prisma/enums";

export type MeetupSummaryDb = Pick<PrismaClient, "meetProposal">;

/**
 * The live meetup for a match, as the chat and the matches list show it: either waiting
 * for an answer (PROPOSED) or confirmed (ACCEPTED), and not yet over. Dates are ISO strings
 * so the value crosses the server/client boundary (and the /api/matches JSON) unchanged.
 */
export interface ActiveMeetupSummary {
  status: "PROPOSED" | "ACCEPTED";
  proposedByUserId: string;
  start: string;
  end: string;
  spotName: string;
  spotNameEn: string | null;
}

/** One query for any number of matches; a match with no live meetup is simply absent from the map. */
export async function getActiveMeetups(
  db: MeetupSummaryDb,
  matchIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ActiveMeetupSummary>> {
  if (matchIds.length === 0) return new Map();

  const proposals = await db.meetProposal.findMany({
    where: {
      matchId: { in: matchIds },
      status: { in: [MeetupStatus.PROPOSED, MeetupStatus.ACCEPTED] },
      scheduledEnd: { gt: now },
    },
    orderBy: { scheduledStart: "asc" },
    select: {
      matchId: true,
      status: true,
      proposedByUserId: true,
      scheduledStart: true,
      scheduledEnd: true,
      spot: { select: { name: true, nameEn: true } },
    },
  });

  const byMatch = new Map<string, ActiveMeetupSummary>();
  for (const p of proposals) {
    // Soonest first, so if a match somehow has two live ones the nearer one wins.
    if (byMatch.has(p.matchId)) continue;
    byMatch.set(p.matchId, {
      status: p.status as "PROPOSED" | "ACCEPTED",
      proposedByUserId: p.proposedByUserId,
      start: p.scheduledStart.toISOString(),
      end: p.scheduledEnd.toISOString(),
      spotName: p.spot.name,
      spotNameEn: p.spot.nameEn,
    });
  }
  return byMatch;
}
