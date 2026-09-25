import type { PrismaClient } from "@/generated/prisma/client";
import { MeetupFeedbackResponse, MeetupStatus } from "@/generated/prisma/enums";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { pairSlotsWithSpots, rankUpcomingSlots, type SlotOption } from "./slots";

export type MeetupDb = Pick<
  PrismaClient,
  "match" | "user" | "spot" | "meetProposal" | "meetupFeedbackEntry" | "planShareLink"
>;

interface MatchParticipants {
  matchId: string;
  userAId: string;
  userBId: string;
  status: "ACTIVE" | "UNMATCHED";
}

/** The one auth check every meetup query/action needs, mirroring chat's `getConversationForActor`: null for "doesn't exist" and "not a participant" alike. */
export async function loadMatchForActor(
  db: MeetupDb,
  matchId: string,
  actorUserId: string,
): Promise<MatchParticipants | null> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, userAId: true, userBId: true, status: true },
  });
  if (!match) return null;
  if (match.userAId !== actorUserId && match.userBId !== actorUserId) return null;
  return { matchId: match.id, userAId: match.userAId, userBId: match.userBId, status: match.status };
}

export function otherUserId(match: MatchParticipants, actorUserId: string): string {
  return match.userAId === actorUserId ? match.userBId : match.userAId;
}

export interface MeetupOption extends SlotOption {
  spotName: string;
  spotNameEn: string | null;
}

/** E1: the top-3 (slot × Safe Spot) options a proposer picks one of. Empty when either side has no free-time overlap, or the campus has no Safe Spot configured yet — never a fabricated option. */
export async function getMeetupOptions(
  db: MeetupDb,
  match: MatchParticipants,
  now: Date = new Date(),
): Promise<MeetupOption[]> {
  const [userA, userB] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: match.userAId },
      select: { campusId: true, profile: { select: { freeTimeSlots: true } } },
    }),
    db.user.findUniqueOrThrow({
      where: { id: match.userBId },
      select: { campusId: true, profile: { select: { freeTimeSlots: true } } },
    }),
  ]);

  const sharedSlots = intersectSlots(userA.profile?.freeTimeSlots ?? [], userB.profile?.freeTimeSlots ?? []);
  if (sharedSlots.length === 0) return [];

  const campusId = userA.campusId;
  if (!campusId) return [];
  const spots = await db.spot.findMany({
    where: { campusId, isSafeSpot: true, active: true },
    select: { id: true, name: true, nameEn: true },
  });
  if (spots.length === 0) return [];

  const spotById = new Map(spots.map((s) => [s.id, s]));
  const ranked = rankUpcomingSlots(sharedSlots, now, 3);
  return pairSlotsWithSpots(ranked, spots.map((s) => s.id)).map((option) => {
    const spot = spotById.get(option.spotId)!;
    return { ...option, spotName: spot.name, spotNameEn: spot.nameEn };
  });
}

function intersectSlots(a: readonly number[], b: readonly number[]): number[] {
  const setB = new Set(b);
  return [...new Set(a)].filter((x) => setB.has(x));
}

export interface MeetupProposalView {
  proposalId: string;
  status: MeetupStatus;
  proposedByUserId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  spotName: string;
  spotNameEn: string | null;
  otherFirstName: string | null;
  otherPhotoUrl: string | null;
  myFeedbackResponse: MeetupFeedbackResponse | null;
  shareLinks: { id: string; token: string; expiresAt: Date; revokedAt: Date | null }[];
}

/** The most recent proposal for a match (any status) — the meetup page's whole state derives from this, or its absence. */
export async function getMeetupForMatch(
  db: MeetupDb,
  match: MatchParticipants,
  actorUserId: string,
): Promise<MeetupProposalView | null> {
  const proposal = await db.meetProposal.findFirst({
    where: { matchId: match.matchId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      proposedByUserId: true,
      scheduledStart: true,
      scheduledEnd: true,
      spot: { select: { name: true, nameEn: true } },
      feedback: { where: { userId: actorUserId }, select: { response: true } },
      shareLinks: { select: { id: true, token: true, expiresAt: true, revokedAt: true } },
    },
  });
  if (!proposal) return null;

  const otherId = otherUserId(match, actorUserId);
  const other = await db.user.findUnique({
    where: { id: otherId },
    select: {
      profile: {
        select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } },
      },
    },
  });
  const photo = other?.profile?.photos[0];

  return {
    proposalId: proposal.id,
    status: proposal.status,
    proposedByUserId: proposal.proposedByUserId,
    scheduledStart: proposal.scheduledStart,
    scheduledEnd: proposal.scheduledEnd,
    spotName: proposal.spot.name,
    spotNameEn: proposal.spot.nameEn,
    otherFirstName: other?.profile?.firstName ?? null,
    otherPhotoUrl: photo ? await resolvePhotoUrl(photo.storageKey) : null,
    myFeedbackResponse: proposal.feedback[0]?.response ?? null,
    shareLinks: proposal.shareLinks,
  };
}

export interface ShareLinkView {
  otherFirstName: string | null;
  spotName: string;
  spotNameEn: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  expired: boolean;
}

/**
 * Public (no auth) read for E3's "share my plans" link — a trusted contact who is never
 * a signed-in Overlap user. `expired` covers both a passed `expiresAt` and a revoked
 * link; a token that doesn't exist at all returns `null`, identically to an expired one
 * as far as the *page* is concerned (the caller renders the same "link expired" state
 * either way, so a guessed token can't distinguish "never existed" from "expired").
 */
export async function getShareLinkView(
  db: MeetupDb,
  token: string,
  now: Date = new Date(),
): Promise<ShareLinkView | null> {
  const link = await db.planShareLink.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      revokedAt: true,
      proposal: {
        select: {
          scheduledStart: true,
          scheduledEnd: true,
          spot: { select: { name: true, nameEn: true } },
          match: {
            select: {
              userAId: true,
              userBId: true,
              userA: { select: { profile: { select: { firstName: true } } } },
              userB: { select: { profile: { select: { firstName: true } } } },
            },
          },
        },
      },
    },
  });
  if (!link) return null;

  const expired = link.revokedAt !== null || link.expiresAt <= now;
  return {
    // Either participant's first name is fine to show here — the link doesn't identify
    // which of the two shared it, only that a meetup is planned between them.
    otherFirstName: link.proposal.match.userA.profile?.firstName ?? link.proposal.match.userB.profile?.firstName ?? null,
    spotName: link.proposal.spot.name,
    spotNameEn: link.proposal.spot.nameEn,
    scheduledStart: link.proposal.scheduledStart,
    scheduledEnd: link.proposal.scheduledEnd,
    expired,
  };
}
