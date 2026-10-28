import type { PrismaClient } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { isBlockedEitherWay } from "@/server/waves/blocks";
import { createMatchWithConversation } from "@/server/waves/match";
import { orderedPair } from "@/server/waves/pair";
import { canRsvp, eventPhase } from "./rules";

export type EventActionDb = Pick<
  PrismaClient,
  "event" | "eventRsvp" | "eventConnect" | "user" | "hideRule" | "block" | "match" | "conversation" | "notification" | "$transaction"
>;

type Person = { userId: string; campusId: string };

export type RsvpResult =
  | { status: "saved" }
  | { status: "error"; code: "NOT_FOUND" | "RSVP_CLOSED" | "FULL" };

/**
 * F1 RSVP and F2 guest-list opt-in: going yes/no, plus "show me in the guest list". Shared by the
 * website's `setRsvp` action and the mobile `PUT /events/{id}/rsvp` route. Capacity and the event's
 * phase are enforced here, never trusted from the screen.
 */
export async function setRsvpStep(
  db: EventActionDb,
  person: Person,
  input: { eventId: string; going: boolean; showInGuestList: boolean },
  now: Date = new Date(),
): Promise<RsvpResult> {
  const { eventId, going, showInGuestList } = input;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { campusId: true, startsAt: true, endsAt: true, cancelledAt: true, capacity: true },
  });
  if (!event || event.campusId !== person.campusId) return { status: "error", code: "NOT_FOUND" };
  if (!canRsvp(eventPhase(event, now))) return { status: "error", code: "RSVP_CLOSED" };

  const key = { eventId_userId: { eventId, userId: person.userId } };
  if (!going) {
    await db.eventRsvp.deleteMany({ where: { eventId, userId: person.userId } });
    return { status: "saved" };
  }

  const existing = await db.eventRsvp.findUnique({ where: key, select: { id: true } });
  if (!existing && event.capacity != null) {
    const count = await db.eventRsvp.count({ where: { eventId } });
    if (count >= event.capacity) return { status: "error", code: "FULL" };
  }
  await db.eventRsvp.upsert({
    where: key,
    create: { eventId, userId: person.userId, showInGuestList },
    update: { showInGuestList },
  });
  return { status: "saved" };
}

export type ConnectResult =
  | { status: "connected"; matched: boolean }
  | { status: "error"; code: "INVALID_INPUT" | "NOT_FOUND" | "CONNECT_CLOSED" | "NOT_VERIFIED" };

/**
 * F3: "I met you" in the 48 hours after an event. Both people must have RSVP'd, and the target must
 * have opted into the guest list (that is the only way to have seen them). A mutual pick becomes a
 * Match with no wave, unless the pair already has one; an unmatch is final, so it is never recreated
 * here. Shared by the website's `connectAtEvent` action and the mobile `POST /events/{id}/connect`.
 */
export async function connectAtEventStep(
  db: EventActionDb,
  person: Person,
  input: { eventId: string; toUserId: string },
  now: Date = new Date(),
): Promise<ConnectResult> {
  const { eventId, toUserId } = input;
  if (toUserId === person.userId) return { status: "error", code: "INVALID_INPUT" };

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { campusId: true, startsAt: true, endsAt: true, cancelledAt: true },
  });
  if (!event || event.campusId !== person.campusId) return { status: "error", code: "NOT_FOUND" };
  if (eventPhase(event, now) !== "connect") return { status: "error", code: "CONNECT_CLOSED" };

  const [me, mine, theirs] = await Promise.all([
    db.user.findUnique({ where: { id: person.userId }, select: { verifiedAt: true } }),
    db.eventRsvp.findUnique({ where: { eventId_userId: { eventId, userId: person.userId } } }),
    db.eventRsvp.findFirst({
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

  const hidden = await db.hideRule.findFirst({
    where: {
      OR: [
        { userId: person.userId, hiddenUserId: toUserId },
        { userId: toUserId, hiddenUserId: person.userId },
      ],
    },
    select: { id: true },
  });
  if (hidden || (await isBlockedEitherWay(db, person.userId, toUserId))) {
    return { status: "error", code: "NOT_FOUND" };
  }

  // Committed on its own first: if both people pick each other at the same moment, each request must
  // be able to see the other's pick when it checks below.
  await db.eventConnect.upsert({
    where: { eventId_fromUserId_toUserId: { eventId, fromUserId: person.userId, toUserId } },
    create: { eventId, fromUserId: person.userId, toUserId },
    update: {},
  });

  const reverse = await db.eventConnect.findUnique({
    where: { eventId_fromUserId_toUserId: { eventId, fromUserId: toUserId, toUserId: person.userId } },
    select: { id: true },
  });
  if (!reverse) return { status: "connected", matched: false };

  const [userAId, userBId] = orderedPair(person.userId, toUserId);
  const existing = await db.match.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
    select: { id: true },
  });
  if (existing) return { status: "connected", matched: false };

  try {
    await db.$transaction((tx) => createMatchWithConversation(tx, person.userId, toUserId));
  } catch (error) {
    // Both requests raced past the check above; the other one created the match.
    if ((error as { code?: unknown } | null)?.code !== "P2002") throw error;
  }
  return { status: "connected", matched: true };
}
