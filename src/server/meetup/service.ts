import type { PrismaClient } from "@/generated/prisma/client";
import type { MeetupFeedbackResponse } from "@/generated/prisma/enums";
import { MeetupStatus } from "@/generated/prisma/enums";
import { customSlot } from "./custom";
import { getMeetupOptions, loadMatchForActor, type MeetupDb } from "./queries";
import { generateShareToken } from "./token";

/** How long after the meetup's own end a "share my plans" link stays live — long enough for a trusted contact to check in shortly after, never indefinitely. */
export const SHARE_LINK_GRACE_HOURS = 6;

export type MeetupWriteDb = MeetupDb & Pick<PrismaClient, "meetProposal" | "planShareLink" | "meetupFeedbackEntry" | "spot">;

type Person = { userId: string; campusId: string };

export type ProposeResult =
  | { status: "proposed" }
  | { status: "error"; code: "NOT_FOUND" | "UNMATCHED" | "ALREADY_PLANNED" | "INVALID_OPTION" };

async function hasLiveProposal(db: MeetupWriteDb, matchId: string): Promise<boolean> {
  const existing = await db.meetProposal.findFirst({
    where: { matchId, status: { in: [MeetupStatus.PROPOSED, MeetupStatus.ACCEPTED] } },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * E1: "plan a meetup." Recomputes the actor's own top-3 options server-side and confirms the
 * submitted (day, block, spotId) is actually one of them — defense-in-depth against a stale
 * client render. Shared by the website's `proposeMeetup` action and the mobile route.
 */
export async function proposeMeetupStep(
  db: MeetupWriteDb,
  person: Person,
  input: { matchId: string; spotId: string; day: number; block: number },
  now: Date = new Date(),
): Promise<ProposeResult> {
  const match = await loadMatchForActor(db, input.matchId, person.userId);
  if (!match) return { status: "error", code: "NOT_FOUND" };
  if (match.status !== "ACTIVE") return { status: "error", code: "UNMATCHED" };
  if (await hasLiveProposal(db, match.matchId)) return { status: "error", code: "ALREADY_PLANNED" };

  const options = await getMeetupOptions(db, match, now);
  const chosen = options.find((o) => o.day === input.day && o.block === input.block && o.spotId === input.spotId);
  if (!chosen) return { status: "error", code: "INVALID_OPTION" };

  await db.meetProposal.create({
    data: {
      matchId: match.matchId,
      proposedByUserId: person.userId,
      spotId: input.spotId,
      day: input.day,
      block: input.block,
      scheduledStart: chosen.start,
      scheduledEnd: chosen.end,
      proposerSeenStatus: MeetupStatus.PROPOSED,
    },
  });
  return { status: "proposed" };
}

/**
 * E1 fallback: "suggest your own time" — a day, a daytime block and a Safe Spot, all re-checked
 * here (the spot must be an active Safe Spot on the person's campus; the time must be allowed,
 * see custom.ts). The other person still accepts or declines.
 */
export async function proposeCustomMeetupStep(
  db: MeetupWriteDb,
  person: Person,
  input: { matchId: string; spotId: string; dayOffset: number; block: number },
  now: Date = new Date(),
): Promise<ProposeResult> {
  const match = await loadMatchForActor(db, input.matchId, person.userId);
  if (!match) return { status: "error", code: "NOT_FOUND" };
  if (match.status !== "ACTIVE") return { status: "error", code: "UNMATCHED" };
  if (await hasLiveProposal(db, match.matchId)) return { status: "error", code: "ALREADY_PLANNED" };

  const spot = await db.spot.findFirst({
    where: { id: input.spotId, campusId: person.campusId, isSafeSpot: true, active: true },
    select: { id: true },
  });
  if (!spot) return { status: "error", code: "INVALID_OPTION" };

  const slot = customSlot(input.dayOffset, input.block, now);
  if (!slot) return { status: "error", code: "INVALID_OPTION" };

  await db.meetProposal.create({
    data: {
      matchId: match.matchId,
      proposedByUserId: person.userId,
      spotId: spot.id,
      day: slot.day,
      block: slot.block,
      scheduledStart: slot.start,
      scheduledEnd: slot.end,
      proposerSeenStatus: MeetupStatus.PROPOSED,
    },
  });
  return { status: "proposed" };
}

export type RespondResult =
  | { status: "accepted" | "declined" }
  | { status: "error"; code: "NOT_FOUND" | "NOT_PENDING" | "CANNOT_ACCEPT_OWN" };

/** E1: "other user accepts or counters" — a counter is simply a decline followed by a fresh proposal. */
export async function respondToMeetupStep(
  db: MeetupWriteDb,
  person: { userId: string },
  proposalId: string,
  decision: "ACCEPT" | "DECLINE",
): Promise<RespondResult> {
  const proposal = await db.meetProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, proposedByUserId: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== person.userId && match.userBId !== person.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.PROPOSED) return { status: "error", code: "NOT_PENDING" };
  if (decision === "ACCEPT" && proposal.proposedByUserId === person.userId) {
    return { status: "error", code: "CANNOT_ACCEPT_OWN" };
  }

  const newStatus = decision === "ACCEPT" ? MeetupStatus.ACCEPTED : MeetupStatus.DECLINED;
  await db.meetProposal.update({
    where: { id: proposal.id },
    data: {
      status: newStatus,
      respondedByUserId: person.userId,
      respondedAt: new Date(),
      ...(proposal.proposedByUserId === person.userId ? { proposerSeenStatus: newStatus } : { responderSeenStatus: newStatus }),
    },
  });
  return { status: decision === "ACCEPT" ? "accepted" : "declined" };
}

export type CancelResult = { status: "cancelled" } | { status: "error"; code: "NOT_FOUND" | "NOT_ACCEPTED" };

export async function cancelMeetupStep(db: MeetupWriteDb, person: { userId: string }, proposalId: string): Promise<CancelResult> {
  const proposal = await db.meetProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== person.userId && match.userBId !== person.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.ACCEPTED) return { status: "error", code: "NOT_ACCEPTED" };

  await db.meetProposal.update({
    where: { id: proposal.id },
    data: { status: MeetupStatus.CANCELLED, respondedByUserId: person.userId, respondedAt: new Date() },
  });
  return { status: "cancelled" };
}

export type FeedbackResult = { status: "saved" } | { status: "error"; code: "NOT_FOUND" | "NOT_ACCEPTED" };

/** E4: private per-participant check-in — never auto-files a report, even for UNCOMFORTABLE (G1). */
export async function submitMeetupFeedbackStep(
  db: MeetupWriteDb,
  person: { userId: string },
  proposalId: string,
  response: MeetupFeedbackResponse,
): Promise<FeedbackResult> {
  const proposal = await db.meetProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== person.userId && match.userBId !== person.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.ACCEPTED) return { status: "error", code: "NOT_ACCEPTED" };

  await db.meetupFeedbackEntry.upsert({
    where: { proposalId_userId: { proposalId: proposal.id, userId: person.userId } },
    update: { response },
    create: { proposalId: proposal.id, userId: person.userId, response },
  });
  return { status: "saved" };
}

export type CreateShareLinkResult =
  | { status: "created"; path: string; expiresAt: Date }
  | { status: "error"; code: "NOT_FOUND" | "NOT_ACCEPTED" };

/** E3: tokenized, expiring, text-only "share my plans" link. */
export async function createShareLinkStep(db: MeetupWriteDb, person: { userId: string }, proposalId: string): Promise<CreateShareLinkResult> {
  const proposal = await db.meetProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, scheduledEnd: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== person.userId && match.userBId !== person.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.ACCEPTED) return { status: "error", code: "NOT_ACCEPTED" };

  const token = generateShareToken();
  const expiresAt = new Date(proposal.scheduledEnd.getTime() + SHARE_LINK_GRACE_HOURS * 60 * 60 * 1000);
  await db.planShareLink.create({ data: { proposalId: proposal.id, token, expiresAt } });
  return { status: "created", path: `/plan/${token}`, expiresAt };
}
