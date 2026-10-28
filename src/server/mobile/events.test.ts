import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { EventDetail, EventListItem } from "@/server/events/queries";
import { mobileError, type MobileContext } from "./guard";
import { connectHandler, eventDetailHandler, eventsListHandler, rsvpHandler } from "./events";

const ORIGIN = "https://overlaps.tech";
const actor = { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE };
const ctx = (path: string, method = "GET", body?: unknown): MobileContext => ({
  actor,
  request: new Request(`${ORIGIN}/api/mobile/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
});
const person = { userId: "user-a", campusId: "campus-1" };

const item = (overrides: Partial<EventListItem> = {}): EventListItem => ({
  id: "e1",
  title: "Welcome picnic",
  spotName: "Central Square Lawn",
  startsAt: new Date("2026-10-30T09:00:00Z"),
  endsAt: new Date("2026-10-30T11:00:00Z"),
  phase: "upcoming",
  goingCount: 3,
  capacity: 40,
  imGoing: false,
  ...overrides,
});

describe("eventsListHandler", () => {
  const deps = (events: EventListItem[], limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    listEvents: vi.fn(async () => events),
  });

  it("returns the events with ISO times", async () => {
    const response = await eventsListHandler(ctx("/events"), deps([item()]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      events: [
        {
          id: "e1",
          title: "Welcome picnic",
          spotName: "Central Square Lawn",
          startsAt: "2026-10-30T09:00:00.000Z",
          endsAt: "2026-10-30T11:00:00.000Z",
          phase: "upcoming",
          goingCount: 3,
          capacity: 40,
          imGoing: false,
        },
      ],
    });
  });

  it("asks for the caller's own campus", async () => {
    const d = deps([]);
    await eventsListHandler(ctx("/events"), d);
    expect(d.listEvents).toHaveBeenCalledWith(person);
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps([item()], mobileError("RATE_LIMITED"));
    expect((await eventsListHandler(ctx("/events"), d)).status).toBe(429);
    expect(d.listEvents).not.toHaveBeenCalled();
  });
});

const detail = (overrides: Partial<EventDetail> = {}): EventDetail => ({
  id: "e1",
  title: "Welcome picnic",
  description: "Bring a friend",
  spotName: "Central Square Lawn",
  organizerFirstName: "Mina",
  startsAt: new Date("2026-10-30T09:00:00Z"),
  endsAt: new Date("2026-10-30T11:00:00Z"),
  phase: "upcoming",
  goingCount: 3,
  capacity: 40,
  myRsvp: null,
  viewerVerified: true,
  guests: [{ userId: "u2", firstName: "Jun", photoUrl: "/api/dev-storage/profile-photos/u/p.jpg", overlap: 2, connected: false, matched: false }],
  ...overrides,
});

describe("eventDetailHandler", () => {
  const deps = (result: EventDetail | null, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getEvent: vi.fn(async () => result),
  });

  it("returns the event with full photo addresses, and guests with nothing beyond name, photo and what is shared", async () => {
    const response = await eventDetailHandler(ctx("/events/e1"), deps(detail()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.guests).toEqual([
      { userId: "u2", firstName: "Jun", photoUrl: `${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg`, overlap: 2, connected: false, matched: false },
    ]);
    expect(body.startsAt).toBe("2026-10-30T09:00:00.000Z");
    expect(body.organizerFirstName).toBe("Mina");
  });

  it("says whether the viewer can RSVP or connect, by phase, going and verification", async () => {
    const upcoming = await (await eventDetailHandler(ctx("/events/e1"), deps(detail()))).json();
    expect([upcoming.canRsvp, upcoming.canConnect]).toEqual([true, false]);
    const ended = await (await eventDetailHandler(ctx("/events/e1"), deps(detail({ phase: "connect", myRsvp: { showInGuestList: true } })))).json();
    expect([ended.canRsvp, ended.canConnect]).toEqual([false, true]);
    const notGoing = await (await eventDetailHandler(ctx("/events/e1"), deps(detail({ phase: "connect", myRsvp: null })))).json();
    expect(notGoing.canConnect).toBe(false);
    const unverified = await (await eventDetailHandler(ctx("/events/e1"), deps(detail({ phase: "connect", myRsvp: { showInGuestList: false }, viewerVerified: false })))).json();
    expect(unverified.canConnect).toBe(false);
    const closed = await (await eventDetailHandler(ctx("/events/e1"), deps(detail({ phase: "closed" })))).json();
    expect(closed.canRsvp).toBe(false);
  });

  it("asks for the event named in the path, as the caller", async () => {
    const d = deps(detail());
    await eventDetailHandler(ctx("/events/e1"), d);
    expect(d.getEvent).toHaveBeenCalledWith(person, "e1");
  });

  it("answers 404 for an event on another campus or that does not exist", async () => {
    expect((await eventDetailHandler(ctx("/events/e1"), deps(null))).status).toBe(404);
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps(detail(), mobileError("RATE_LIMITED"));
    expect((await eventDetailHandler(ctx("/events/e1"), d)).status).toBe(429);
    expect(d.getEvent).not.toHaveBeenCalled();
  });
});

describe("rsvpHandler", () => {
  type Result = { status: "saved" } | { status: "error"; code: "NOT_FOUND" | "RSVP_CLOSED" | "FULL" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    setRsvp: vi.fn(async () => result),
  });

  it("saves the RSVP, with being listed off unless asked for", async () => {
    const d = deps({ status: "saved" });
    const response = await rsvpHandler(ctx("/events/e1/rsvp", "PUT", { going: true }), d);
    expect(await response.json()).toEqual({ status: "saved", going: true, showInGuestList: false });
    expect(d.setRsvp).toHaveBeenCalledWith(person, { eventId: "e1", going: true, showInGuestList: false });
  });

  it("never reports a listing for someone who is not going", async () => {
    const response = await rsvpHandler(ctx("/events/e1/rsvp", "PUT", { going: false, showInGuestList: true }), deps({ status: "saved" }));
    expect((await response.json()).showInGuestList).toBe(false);
  });

  it("answers 404, and 422 with the reason for RSVP_CLOSED and FULL", async () => {
    expect((await rsvpHandler(ctx("/events/e1/rsvp", "PUT", { going: true }), deps({ status: "error", code: "NOT_FOUND" }))).status).toBe(404);
    for (const code of ["RSVP_CLOSED", "FULL"] as const) {
      const response = await rsvpHandler(ctx("/events/e1/rsvp", "PUT", { going: true }), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("refuses a malformed body or an unexpected field (400) without asking the database", async () => {
    for (const bad of [{}, { going: "yes" }, { going: true, extra: 1 }, { going: true, showInGuestList: "on" }]) {
      const d = deps({ status: "saved" });
      expect((await rsvpHandler(ctx("/events/e1/rsvp", "PUT", bad), d)).status, JSON.stringify(bad)).toBe(400);
      expect(d.setRsvp).not.toHaveBeenCalled();
    }
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "saved" }, mobileError("RATE_LIMITED"));
    expect((await rsvpHandler(ctx("/events/e1/rsvp", "PUT", { going: true }), d)).status).toBe(429);
    expect(d.setRsvp).not.toHaveBeenCalled();
  });
});

describe("connectHandler", () => {
  type Result = { status: "connected"; matched: boolean } | { status: "error"; code: "INVALID_INPUT" | "NOT_FOUND" | "CONNECT_CLOSED" | "NOT_VERIFIED" };
  const deps = (result: Result) => ({ limit: vi.fn(async () => null), connect: vi.fn(async () => result) });

  it("passes the pick through and reports whether it made a match", async () => {
    const d = deps({ status: "connected", matched: true });
    const response = await connectHandler(ctx("/events/e1/connect", "POST", { toUserId: "u2" }), d);
    expect(await response.json()).toEqual({ status: "connected", matched: true });
    expect(d.connect).toHaveBeenCalledWith(person, { eventId: "e1", toUserId: "u2" });
  });

  it("answers 404, 400 for picking yourself, and 422 with the reason for a closed window and an unverified caller", async () => {
    expect((await connectHandler(ctx("/events/e1/connect", "POST", { toUserId: "u2" }), deps({ status: "error", code: "NOT_FOUND" }))).status).toBe(404);
    expect((await connectHandler(ctx("/events/e1/connect", "POST", { toUserId: "u2" }), deps({ status: "error", code: "INVALID_INPUT" }))).status).toBe(400);
    for (const code of ["CONNECT_CLOSED", "NOT_VERIFIED"] as const) {
      const response = await connectHandler(ctx("/events/e1/connect", "POST", { toUserId: "u2" }), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("refuses a missing person or an unexpected field (400)", async () => {
    for (const bad of [{}, { toUserId: "" }, { toUserId: "u2", extra: 1 }]) {
      const d = deps({ status: "connected", matched: false });
      expect((await connectHandler(ctx("/events/e1/connect", "POST", bad), d)).status).toBe(400);
      expect(d.connect).not.toHaveBeenCalled();
    }
  });
});
