"use server";

import { UserStatus } from "@/generated/prisma/enums";
import { can, Role } from "@/server/auth/authz";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { containsSensitiveContent } from "@/server/reference/sensitive";
import { isBlockedEitherWay } from "@/server/waves/blocks";
import { createMatchWithConversation } from "@/server/waves/match";
import { orderedPair } from "@/server/waves/pair";
import { canRsvp, eventPhase, MAX_EVENT_DURATION_MS, parseSeoulLocalDateTime } from "./rules";
import { connectSchema, createEventSchema, rsvpSchema } from "./schema";

export type EventActionState =
  | { status: "idle" }
  | { status: "success"; eventId?: string; matched?: boolean }
  | { status: "error"; code: string };

const EVENT_ACTION_RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };

/** F1: verified organizers only (ambassador or above), always at a campus safe spot. */
export async function createEvent(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (!can(actor, Role.AMBASSADOR)) return { status: "error", code: "FORBIDDEN" };

  const rate = await checkRateLimit(prisma, `create-event:${actor.userId}`, {
    max: 20,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const parsed = createEventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };
  const { title, description, spotId, capacity } = parsed.data;
  if (containsSensitiveContent(title) || containsSensitiveContent(description)) {
    return { status: "error", code: "SENSITIVE_CONTENT" };
  }

  const startsAt = parseSeoulLocalDateTime(parsed.data.startsAt);
  const endsAt = parseSeoulLocalDateTime(parsed.data.endsAt);
  if (!startsAt || !endsAt) return { status: "error", code: "INVALID_TIME" };
  if (startsAt.getTime() <= Date.now()) return { status: "error", code: "STARTS_IN_PAST" };
  if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > MAX_EVENT_DURATION_MS) {
    return { status: "error", code: "INVALID_DURATION" };
  }

  const spot = await prisma.spot.findFirst({
    where: { id: spotId, campusId: actor.campusId, isSafeSpot: true, active: true },
    select: { id: true },
  });
  if (!spot) return { status: "error", code: "NOT_A_SAFE_SPOT" };

  const event = await prisma.event.create({
    data: {
      campusId: actor.campusId,
      organizerId: actor.userId,
      spotId: spot.id,
      title,
      description,
      startsAt,
      endsAt,
      capacity: capacity ?? null,
    },
    select: { id: true },
  });
  return { status: "success", eventId: event.id };
}

/** F1 RSVP and F2 guest-list opt-in, in one form: going yes/no, plus "show me". */
export async function setRsvp(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (actor.status !== UserStatus.ACTIVE) return { status: "error", code: "FORBIDDEN" };

  const rate = await checkRateLimit(
    prisma,
    `event-action:${actor.userId}`,
    EVENT_ACTION_RATE_LIMIT,
  );
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const parsed = rsvpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };
  const { eventId, going } = parsed.data;
  const showInGuestList = parsed.data.showInGuestList === "on";

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { campusId: true, startsAt: true, endsAt: true, cancelledAt: true, capacity: true },
  });
  if (!event || event.campusId !== actor.campusId) return { status: "error", code: "NOT_FOUND" };
  if (!canRsvp(eventPhase(event, new Date()))) return { status: "error", code: "RSVP_CLOSED" };

  const key = { eventId_userId: { eventId, userId: actor.userId } };
  if (going === "no") {
    await prisma.eventRsvp.deleteMany({ where: { eventId, userId: actor.userId } });
    return { status: "success" };
  }

  const existing = await prisma.eventRsvp.findUnique({ where: key, select: { id: true } });
  if (!existing && event.capacity != null) {
    const count = await prisma.eventRsvp.count({ where: { eventId } });
    if (count >= event.capacity) return { status: "error", code: "FULL" };
  }
  await prisma.eventRsvp.upsert({
    where: key,
    create: { eventId, userId: actor.userId, showInGuestList },
    update: { showInGuestList },
  });
  return { status: "success" };
}

/**
 * F3: "I met you" in the 48 hours after an event. Both people must have RSVP'd, and the
 * target must have opted into the guest list (that's the only way to have seen them).
 * A mutual pick becomes a Match with no wave, unless the pair already has one; an
 * unmatch is final, so it's never recreated here.
 */
export async function connectAtEvent(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (actor.status !== UserStatus.ACTIVE) return { status: "error", code: "FORBIDDEN" };

  const rate = await checkRateLimit(
    prisma,
    `event-action:${actor.userId}`,
    EVENT_ACTION_RATE_LIMIT,
  );
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const parsed = connectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };
  const { eventId, toUserId } = parsed.data;
  if (toUserId === actor.userId) return { status: "error", code: "INVALID_INPUT" };

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { campusId: true, startsAt: true, endsAt: true, cancelledAt: true },
  });
  if (!event || event.campusId !== actor.campusId) return { status: "error", code: "NOT_FOUND" };
  if (eventPhase(event, new Date()) !== "connect")
    return { status: "error", code: "CONNECT_CLOSED" };

  const [me, mine, theirs] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.userId }, select: { verifiedAt: true } }),
    prisma.eventRsvp.findUnique({ where: { eventId_userId: { eventId, userId: actor.userId } } }),
    prisma.eventRsvp.findFirst({
      where: {
        eventId,
        userId: toUserId,
        showInGuestList: true,
        user: { status: UserStatus.ACTIVE, verifiedAt: { not: null } },
      },
    }),
  ]);
  if (!me?.verifiedAt) return { status: "error", code: "NOT_VERIFIED" };
  if (!mine || !theirs) return { status: "error", code: "NOT_FOUND" };

  const hidden = await prisma.hideRule.findFirst({
    where: {
      OR: [
        { userId: actor.userId, hiddenUserId: toUserId },
        { userId: toUserId, hiddenUserId: actor.userId },
      ],
    },
    select: { id: true },
  });
  if (hidden || (await isBlockedEitherWay(prisma, actor.userId, toUserId))) {
    return { status: "error", code: "NOT_FOUND" };
  }

  // Committed on its own first: if both people pick each other at the same moment, each
  // request must be able to see the other's pick when it checks below.
  await prisma.eventConnect.upsert({
    where: { eventId_fromUserId_toUserId: { eventId, fromUserId: actor.userId, toUserId } },
    create: { eventId, fromUserId: actor.userId, toUserId },
    update: {},
  });

  const reverse = await prisma.eventConnect.findUnique({
    where: {
      eventId_fromUserId_toUserId: { eventId, fromUserId: toUserId, toUserId: actor.userId },
    },
    select: { id: true },
  });
  if (!reverse) return { status: "success", matched: false };

  const [userAId, userBId] = orderedPair(actor.userId, toUserId);
  const existing = await prisma.match.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
    select: { id: true },
  });
  if (existing) return { status: "success", matched: false };

  try {
    await prisma.$transaction((tx) => createMatchWithConversation(tx, actor.userId, toUserId));
  } catch (error) {
    // Both requests raced past the check above; the other one created the match.
    if ((error as { code?: unknown } | null)?.code !== "P2002") throw error;
  }
  return { status: "success", matched: true };
}
