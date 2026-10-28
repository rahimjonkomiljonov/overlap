"use server";

import { UserStatus } from "@/generated/prisma/enums";
import { can, Role } from "@/server/auth/authz";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { containsSensitiveContent } from "@/server/reference/sensitive";
import { MAX_EVENT_DURATION_MS, parseSeoulLocalDateTime } from "./rules";
import { connectSchema, createEventSchema, rsvpSchema } from "./schema";
import { connectAtEventStep, setRsvpStep } from "./service";

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

/** F1 RSVP and F2 guest-list opt-in, in one form: going yes/no, plus "show me". Rules in `setRsvpStep`, shared with the mobile route. */
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

  const result = await setRsvpStep(
    prisma,
    { userId: actor.userId, campusId: actor.campusId },
    {
      eventId: parsed.data.eventId,
      going: parsed.data.going === "yes",
      showInGuestList: parsed.data.showInGuestList === "on",
    },
  );
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

/**
 * F3: "I met you" in the 48 hours after an event. Rules in `connectAtEventStep`, shared with the
 * mobile route.
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

  const result = await connectAtEventStep(
    prisma,
    { userId: actor.userId, campusId: actor.campusId },
    parsed.data,
  );
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success", matched: result.matched };
}
