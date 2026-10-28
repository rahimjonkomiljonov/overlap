"use server";

import { isRestricted } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { loadMatchForActor } from "./queries";
import {
  cancelMeetupSchema,
  createShareLinkSchema,
  proposeCustomMeetupSchema,
  proposeMeetupSchema,
  respondToMeetupSchema,
  revokeShareLinkSchema,
  submitMeetupFeedbackSchema,
} from "./schema";
import {
  cancelMeetupStep,
  createShareLinkStep,
  proposeCustomMeetupStep,
  proposeMeetupStep,
  respondToMeetupStep,
  submitMeetupFeedbackStep,
} from "./service";

export type MeetupActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** E1: "plan a meetup." The rules live in `proposeMeetupStep`, shared with the mobile route. */
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

  const result = await proposeMeetupStep(prisma, { userId: actor.userId, campusId: actor.campusId }, parsed.data);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

/** E1 fallback: "suggest your own time". Rules in `proposeCustomMeetupStep`. */
export async function proposeCustomMeetup(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (isRestricted(actor)) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const parsed = proposeCustomMeetupSchema.safeParse({
    matchId: formData.get("matchId"),
    spotId: formData.get("spotId"),
    dayOffset: formData.get("dayOffset"),
    block: formData.get("block"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await proposeCustomMeetupStep(prisma, { userId: actor.userId, campusId: actor.campusId }, parsed.data);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

/**
 * Called when someone opens a match's meetup page: records the status they are now looking
 * at, which is what stops the status dot blinking for them (and only them). Touches only
 * the most recent proposal for that match, and only the caller's own side.
 */
export async function markMeetupSeen(matchId: string): Promise<void> {
  const actor = await getActor();
  if (!actor || typeof matchId !== "string" || matchId.length === 0) return;

  const match = await loadMatchForActor(prisma, matchId, actor.userId);
  if (!match) return;

  const latest = await prisma.meetProposal.findFirst({
    where: { matchId: match.matchId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, proposedByUserId: true },
  });
  if (!latest) return;

  await prisma.meetProposal.update({
    where: { id: latest.id },
    data: latest.proposedByUserId === actor.userId ? { proposerSeenStatus: latest.status } : { responderSeenStatus: latest.status },
  });
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

  const result = await respondToMeetupStep(prisma, { userId: actor.userId }, parsed.data.proposalId, parsed.data.decision);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

export async function cancelMeetup(_prev: MeetupActionState, formData: FormData): Promise<MeetupActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = cancelMeetupSchema.safeParse({ proposalId: formData.get("proposalId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await cancelMeetupStep(prisma, { userId: actor.userId }, parsed.data.proposalId);
  if (result.status === "error") return { status: "error", code: result.code };
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

  const result = await submitMeetupFeedbackStep(prisma, { userId: actor.userId }, parsed.data.proposalId, parsed.data.response);
  if (result.status === "error") return { status: "error", code: result.code };
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

  const result = await createShareLinkStep(prisma, { userId: actor.userId }, parsed.data.proposalId);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success", path: result.path };
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
