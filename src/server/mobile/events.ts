import type { NextResponse } from "next/server";
import * as z from "zod";
import type { EventDetail, EventListItem } from "@/server/events/queries";
import { canRsvp } from "@/server/events/rules";
import type { ConnectResult, RsvpResult } from "@/server/events/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { readJson } from "./validate";

export const EVENTS_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
/** Same budget the website's RSVP and connect actions share. */
export const EVENT_ACTION_RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

const idSchema = z.string().min(1).max(64);
function idFromPath(url: string, index: 1 | 2): { ok: true; id: string } | { ok: false } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = idSchema.safeParse(parts[parts.length - index] ?? "");
  return id.success ? { ok: true, id: id.data } : { ok: false };
}

function problem(result: { status: "error"; code: string }): NextResponse {
  return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
}

export type EventsListDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  listEvents: (person: Person) => Promise<EventListItem[]>;
};

/** GET /events: upcoming and ongoing events on the caller's campus, plus ones still in their 48-hour connect window. */
export async function eventsListHandler(context: MobileContext, deps: EventsListDeps): Promise<NextResponse> {
  const limited = await deps.limit(`events:${context.actor.userId}`);
  if (limited) return limited;

  const events = await deps.listEvents(personOf(context));
  return mobileJson({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      spotName: e.spotName,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      phase: e.phase,
      goingCount: e.goingCount,
      capacity: e.capacity,
      imGoing: e.imGoing,
    })),
  });
}

export type EventDetailDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getEvent: (person: Person, eventId: string) => Promise<EventDetail | null>;
};

/**
 * GET /events/{eventId}. The guest list is the website's own: only people who opted in for this event,
 * active, verified, not incognito, with no block or hide either way, most in common first, and empty
 * for a viewer who is not verified. A guest carries no field beyond name, photo and what the two share.
 */
export async function eventDetailHandler(context: MobileContext, deps: EventDetailDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 1);
  if (!id.ok) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`event-detail:${context.actor.userId}`);
  if (limited) return limited;

  const event = await deps.getEvent(personOf(context), id.id);
  if (!event) return mobileError("NOT_FOUND");

  const going = event.myRsvp !== null;
  return mobileJson({
    id: event.id,
    title: event.title,
    description: event.description,
    spotName: event.spotName,
    organizerFirstName: event.organizerFirstName,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    phase: event.phase,
    goingCount: event.goingCount,
    capacity: event.capacity,
    myRsvp: event.myRsvp,
    viewerVerified: event.viewerVerified,
    canRsvp: canRsvp(event.phase),
    canConnect: event.phase === "connect" && going && event.viewerVerified,
    guests: event.guests.map((g) => ({
      userId: g.userId,
      firstName: g.firstName,
      photoUrl: g.photoUrl ? absoluteUrl(context.request, g.photoUrl) : null,
      overlap: g.overlap,
      connected: g.connected,
      matched: g.matched,
    })),
  });
}

const rsvpBody = z.strictObject({ going: z.boolean(), showInGuestList: z.boolean().default(false) });

export type RsvpDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  setRsvp: (person: Person, input: { eventId: string; going: boolean; showInGuestList: boolean }) => Promise<RsvpResult>;
};

/** PUT /events/{eventId}/rsvp: going or not, and whether to be listed to other verified guests (off unless asked). Capacity and the event's phase are enforced here. */
export async function rsvpHandler(context: MobileContext, deps: RsvpDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, rsvpBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`event-action:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.setRsvp(personOf(context), { eventId: id.id, ...body.data });
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "saved", going: body.data.going, showInGuestList: body.data.going && body.data.showInGuestList });
}

const connectBody = z.strictObject({ toUserId: idSchema });

export type ConnectDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  connect: (person: Person, input: { eventId: string; toUserId: string }) => Promise<ConnectResult>;
};

/** POST /events/{eventId}/connect (idempotent): "we met", in the 48 hours after the event. A mutual pick makes a match with a chat. */
export async function connectHandler(context: MobileContext, deps: ConnectDeps): Promise<NextResponse> {
  const id = idFromPath(context.request.url, 2);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, connectBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`event-action:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.connect(personOf(context), { eventId: id.id, toUserId: body.data.toUserId });
  if (result.status === "error") {
    return result.code === "INVALID_INPUT" ? mobileError("INVALID_INPUT", { fields: [{ name: "toUserId", problem: "invalid" }] }) : problem(result);
  }
  return mobileJson({ status: "connected", matched: result.matched });
}
