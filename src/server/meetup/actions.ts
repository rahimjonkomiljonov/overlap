"use server";

import { MeetupStatus } from "@/generated/prisma/enums";
import { isRestricted } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getMeetupOptions, loadMatchForActor } from "./queries";
import {
  cancelMeetupSchema,
  createShareLinkSchema,
  proposeMeetupSchema,
  respondToMeetupSchema,
  revokeShareLinkSchema,
  submitMeetupFeedbackSchema,
} from "./schema";
import { generateShareToken } from "./token";

/** How long after the meetup's own end a "share my plans" link stays live — long enough for a trusted contact to check in shortly after, never indefinitely. */
const SHARE_LINK_GRACE_HOURS = 6;

export type MeetupActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * E1: "plan a meetup." Recomputes the actor's own top-3 options server-side and confirms
 * the submitted (day, block, spotId) is actually one of them — defense-in-depth against
 * a stale client render, same pattern as `sendWave`'s block/cap re-checks.
 */
export async function proposeMeetup(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (isRestricted(actor)) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const parsed = proposeMeetupSchema.safeParse({
    matchId: formData.get("matchId"),
    spotId: formData.get("spotId"),
    day: formData.get("day"),
    block: formData.get("block"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const match = await loadMatchForActor(prisma, parsed.data.matchId, actor.userId);
  if (!match) return { status: "error", code: "NOT_FOUND" };
  if (match.status !== "ACTIVE") return { status: "error", code: "UNMATCHED" };

  const existing = await prisma.meetProposal.findFirst({
    where: { matchId: match.matchId, status: { in: [MeetupStatus.PROPOSED, MeetupStatus.ACCEPTED] } },
    select: { id: true },
  });
  if (existing) return { status: "error", code: "ALREADY_PLANNED" };

  const now = new Date();
  const options = await getMeetupOptions(prisma, match, now);
  const chosen = options.find((o) => o.day === parsed.data.day && o.block === parsed.data.block && o.spotId === parsed.data.spotId);
  if (!chosen) return { status: "error", code: "INVALID_OPTION" };

  await prisma.meetProposal.create({
    data: {
      matchId: match.matchId,
      proposedByUserId: actor.userId,
      spotId: parsed.data.spotId,
      day: parsed.data.day,
      block: parsed.data.block,
      scheduledStart: chosen.start,
      scheduledEnd: chosen.end,
    },
  });

  return { status: "success" };
}

/** E1: "other user accepts or counters" — a counter is simply a decline followed by a fresh `proposeMeetup`. */
export async function respondToMeetup(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (isRestricted(actor)) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const parsed = respondToMeetupSchema.safeParse({
    proposalId: formData.get("proposalId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const proposal = await prisma.meetProposal.findUnique({
    where: { id: parsed.data.proposalId },
    select: { id: true, status: true, proposedByUserId: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== actor.userId && match.userBId !== actor.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.PROPOSED) return { status: "error", code: "NOT_PENDING" };
  if (parsed.data.decision === "ACCEPT" && proposal.proposedByUserId === actor.userId) {
    return { status: "error", code: "CANNOT_ACCEPT_OWN" };
  }

  await prisma.meetProposal.update({
    where: { id: proposal.id },
    data: {
      status: parsed.data.decision === "ACCEPT" ? MeetupStatus.ACCEPTED : MeetupStatus.DECLINED,
      respondedByUserId: actor.userId,
      respondedAt: new Date(),
    },
  });

  return { status: "success" };
}

export async function cancelMeetup(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = cancelMeetupSchema.safeParse({ proposalId: formData.get("proposalId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const proposal = await prisma.meetProposal.findUnique({
    where: { id: parsed.data.proposalId },
    select: { id: true, status: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== actor.userId && match.userBId !== actor.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.ACCEPTED) return { status: "error", code: "NOT_ACCEPTED" };

  await prisma.meetProposal.update({
    where: { id: proposal.id },
    data: { status: MeetupStatus.CANCELLED, respondedByUserId: actor.userId, respondedAt: new Date() },
  });

  return { status: "success" };
}

/** E4: private per-participant check-in — never auto-files a report even for UNCOMFORTABLE, only the reporter can supply the category/evidence a real report needs (G1). */
export async function submitMeetupFeedback(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = submitMeetupFeedbackSchema.safeParse({
    proposalId: formData.get("proposalId"),
    response: formData.get("response"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const proposal = await prisma.meetProposal.findUnique({
    where: { id: parsed.data.proposalId },
    select: { id: true, status: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== actor.userId && match.userBId !== actor.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.ACCEPTED) return { status: "error", code: "NOT_ACCEPTED" };

  await prisma.meetupFeedbackEntry.upsert({
    where: { proposalId_userId: { proposalId: proposal.id, userId: actor.userId } },
    update: { response: parsed.data.response },
    create: { proposalId: proposal.id, userId: actor.userId, response: parsed.data.response },
  });

  return { status: "success" };
}

export type CreateShareLinkState =
  | { status: "idle" }
  | { status: "success"; path: string }
  | { status: "error"; code: string };

/** E3: tokenized, expiring, text-only "share my plans" link. */
export async function createShareLink(_prev: CreateShareLinkState, formData: FormData): Promise<CreateShareLinkState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (isRestricted(actor)) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const parsed = createShareLinkSchema.safeParse({ proposalId: formData.get("proposalId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const proposal = await prisma.meetProposal.findUnique({
    where: { id: parsed.data.proposalId },
    select: { id: true, status: true, scheduledEnd: true, match: { select: { userAId: true, userBId: true } } },
  });
  if (!proposal) return { status: "error", code: "NOT_FOUND" };
  const { match } = proposal;
  if (match.userAId !== actor.userId && match.userBId !== actor.userId) return { status: "error", code: "NOT_FOUND" };
  if (proposal.status !== MeetupStatus.ACCEPTED) return { status: "error", code: "NOT_ACCEPTED" };

  const token = generateShareToken();
  const expiresAt = new Date(proposal.scheduledEnd.getTime() + SHARE_LINK_GRACE_HOURS * 60 * 60 * 1000);
  await prisma.planShareLink.create({ data: { proposalId: proposal.id, token, expiresAt } });

  return { status: "success", path: `/plan/${token}` };
}

export async function revokeShareLink(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = revokeShareLinkSchema.safeParse({ linkId: formData.get("linkId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const link = await prisma.planShareLink.findUnique({
    where: { id: parsed.data.linkId },
    select: { id: true, proposal: { select: { match: { select: { userAId: true, userBId: true } } } } },
  });
  if (!link) return { status: "error", code: "NOT_FOUND" };
  const { match } = link.proposal;
  if (match.userAId !== actor.userId && match.userBId !== actor.userId) return { status: "error", code: "NOT_FOUND" };

  await prisma.planShareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
  return { status: "success" };
}
