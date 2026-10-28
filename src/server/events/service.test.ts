import { describe, expect, it, vi } from "vitest";
import { connectAtEventStep, setRsvpStep, type EventActionDb } from "./service";

const NOW = new Date("2026-10-28T03:00:00Z");
const HOUR = 60 * 60 * 1000;
const me = { userId: "me", campusId: "campus-1" };

type EventRow = { campusId: string; startsAt: Date; endsAt: Date; cancelledAt: Date | null; capacity: number | null };
const eventAt = (startOffsetH: number, endOffsetH: number, overrides: Partial<EventRow> = {}): EventRow => ({
  campusId: "campus-1",
  startsAt: new Date(NOW.getTime() + startOffsetH * HOUR),
  endsAt: new Date(NOW.getTime() + endOffsetH * HOUR),
  cancelledAt: null,
  capacity: null,
  ...overrides,
});

function fakeDb(
  options: {
    event?: EventRow | null;
    existingRsvp?: boolean;
    rsvpCount?: number;
    verified?: boolean;
    mine?: boolean;
    theirs?: boolean;
    hidden?: boolean;
    blocked?: boolean;
    reverse?: boolean;
    existingMatch?: boolean;
    txFails?: string;
  } = {},
) {
  const {
    event = eventAt(-1, 1),
    existingRsvp,
    rsvpCount = 0,
    verified = true,
    mine = true,
    theirs = true,
    hidden = false,
    blocked = false,
    reverse = false,
    existingMatch = false,
    txFails,
  } = options;
  const upsert = vi.fn(async () => ({}));
  const deleteMany = vi.fn(async () => ({}));
  const connectUpsert = vi.fn(async () => ({}));
  const matchCreate = vi.fn(async () => ({ id: "match-1" }));
  const conversationCreate = vi.fn(async () => ({}));
  const tx = { match: { create: matchCreate }, conversation: { create: conversationCreate }, notification: { upsert: vi.fn(async () => ({})) } };
  const db = {
    event: { findUnique: vi.fn(async () => event) },
    eventRsvp: {
      findUnique: vi.fn(async () => {
        return (existingRsvp ?? mine) ? { id: "r-me" } : null;
      }),
      findFirst: vi.fn(async () => (theirs ? { id: "r-them" } : null)),
      count: vi.fn(async () => rsvpCount),
      upsert,
      deleteMany,
    },
    user: { findUnique: vi.fn(async () => ({ verifiedAt: verified ? new Date() : null })) },
    hideRule: { findFirst: vi.fn(async () => (hidden ? { id: "h" } : null)) },
    block: { findFirst: vi.fn(async () => (blocked ? { id: "b" } : null)) },
    eventConnect: { upsert: connectUpsert, findUnique: vi.fn(async () => (reverse ? { id: "c" } : null)) },
    match: { findUnique: vi.fn(async () => (existingMatch ? { id: "m" } : null)) },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
      if (txFails) throw Object.assign(new Error("db"), { code: txFails });
      return fn(tx);
    }),
  } as unknown as EventActionDb;
  return { db, upsert, deleteMany, connectUpsert, matchCreate, conversationCreate };
}

describe("setRsvpStep", () => {
  const input = { eventId: "e1", going: true, showInGuestList: false };

  it("is NOT_FOUND for an event that does not exist or is on another campus, and writes nothing", async () => {
    for (const event of [null, eventAt(-1, 1, { campusId: "other" })]) {
      const { db, upsert } = fakeDb({ event });
      expect(await setRsvpStep(db, me, input, NOW)).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(upsert).not.toHaveBeenCalled();
    }
  });

  it("is RSVP_CLOSED once the event has ended or been cancelled (even to say not going)", async () => {
    for (const event of [eventAt(-5, -3), eventAt(-5, -3, { cancelledAt: NOW }), eventAt(1, 3, { cancelledAt: NOW })]) {
      const { db, upsert, deleteMany } = fakeDb({ event });
      expect(await setRsvpStep(db, me, input, NOW)).toEqual({ status: "error", code: "RSVP_CLOSED" });
      expect(await setRsvpStep(db, me, { ...input, going: false }, NOW)).toEqual({ status: "error", code: "RSVP_CLOSED" });
      expect(upsert).not.toHaveBeenCalled();
      expect(deleteMany).not.toHaveBeenCalled();
    }
  });

  it("is FULL when the event is at capacity, but someone already going can still change their listing", async () => {
    const full = fakeDb({ event: eventAt(1, 3, { capacity: 5 }), rsvpCount: 5, existingRsvp: false });
    expect(await setRsvpStep(full.db, me, input, NOW)).toEqual({ status: "error", code: "FULL" });
    expect(full.upsert).not.toHaveBeenCalled();
    const already = fakeDb({ event: eventAt(1, 3, { capacity: 5 }), rsvpCount: 5, existingRsvp: true });
    expect(await setRsvpStep(already.db, me, { ...input, showInGuestList: true }, NOW)).toEqual({ status: "saved" });
    expect(already.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { showInGuestList: true } }));
  });

  it("saves an RSVP with the listing choice, which is off unless asked for", async () => {
    const { db, upsert } = fakeDb({ event: eventAt(1, 3) });
    expect(await setRsvpStep(db, me, input, NOW)).toEqual({ status: "saved" });
    expect(upsert).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId: "e1", userId: "me" } },
      create: { eventId: "e1", userId: "me", showInGuestList: false },
      update: { showInGuestList: false },
    });
  });

  it("removes the RSVP (and so the listing) when not going", async () => {
    const { db, deleteMany, upsert } = fakeDb({ event: eventAt(1, 3) });
    expect(await setRsvpStep(db, me, { ...input, going: false }, NOW)).toEqual({ status: "saved" });
    expect(deleteMany).toHaveBeenCalledWith({ where: { eventId: "e1", userId: "me" } });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("connectAtEventStep", () => {
  const input = { eventId: "e1", toUserId: "them" };
  const inWindow = eventAt(-6, -4); // ended 4 hours ago: inside the 48-hour connect window

  it("refuses to pick yourself", async () => {
    const { db, connectUpsert } = fakeDb({ event: inWindow });
    expect(await connectAtEventStep(db, me, { eventId: "e1", toUserId: "me" }, NOW)).toEqual({ status: "error", code: "INVALID_INPUT" });
    expect(connectUpsert).not.toHaveBeenCalled();
  });

  it("is CONNECT_CLOSED before the event ends, while it runs, after 48 hours, and when cancelled", async () => {
    for (const event of [eventAt(1, 3), eventAt(-1, 1), eventAt(-80, -60), eventAt(-6, -4, { cancelledAt: NOW })]) {
      const { db, connectUpsert } = fakeDb({ event });
      const result = await connectAtEventStep(db, me, input, NOW);
      expect(result).toEqual({ status: "error", code: "CONNECT_CLOSED" });
      expect(connectUpsert).not.toHaveBeenCalled();
    }
  });

  it("is NOT_FOUND on another campus, and NOT_VERIFIED for an unverified caller", async () => {
    const other = fakeDb({ event: eventAt(-6, -4, { campusId: "other" }) });
    expect(await connectAtEventStep(other.db, me, input, NOW)).toEqual({ status: "error", code: "NOT_FOUND" });
    const unverified = fakeDb({ event: inWindow, verified: false });
    expect(await connectAtEventStep(unverified.db, me, input, NOW)).toEqual({ status: "error", code: "NOT_VERIFIED" });
    expect(unverified.connectUpsert).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND when either person did not RSVP, or the target did not opt into the list (never says which)", async () => {
    for (const flags of [{ mine: false }, { theirs: false }]) {
      const { db, connectUpsert } = fakeDb({ event: inWindow, ...flags });
      expect(await connectAtEventStep(db, me, input, NOW)).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(connectUpsert).not.toHaveBeenCalled();
    }
  });

  it("is NOT_FOUND for a hidden or blocked pair, exactly like a person who is not there", async () => {
    for (const flags of [{ hidden: true }, { blocked: true }]) {
      const { db, connectUpsert } = fakeDb({ event: inWindow, ...flags });
      expect(await connectAtEventStep(db, me, input, NOW)).toEqual({ status: "error", code: "NOT_FOUND" });
      expect(connectUpsert).not.toHaveBeenCalled();
    }
  });

  it("records a one-sided pick without a match", async () => {
    const { db, connectUpsert, matchCreate } = fakeDb({ event: inWindow });
    expect(await connectAtEventStep(db, me, input, NOW)).toEqual({ status: "connected", matched: false });
    expect(connectUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: { eventId: "e1", fromUserId: "me", toUserId: "them" } }));
    expect(matchCreate).not.toHaveBeenCalled();
  });

  it("makes a match with a conversation when the other person had already picked you", async () => {
    const { db, matchCreate, conversationCreate } = fakeDb({ event: inWindow, reverse: true });
    expect(await connectAtEventStep(db, me, input, NOW)).toEqual({ status: "connected", matched: true });
    expect(matchCreate).toHaveBeenCalledWith({ data: { userAId: "me", userBId: "them" } });
    expect(conversationCreate).toHaveBeenCalled();
  });

  it("never recreates a match the pair already has (an unmatch is final)", async () => {
    const { db, matchCreate } = fakeDb({ event: inWindow, reverse: true, existingMatch: true });
    expect(await connectAtEventStep(db, me, input, NOW)).toEqual({ status: "connected", matched: false });
    expect(matchCreate).not.toHaveBeenCalled();
  });

  it("treats losing a race to create the match as success without a second match (P2002), and rethrows anything else", async () => {
    const raced = fakeDb({ event: inWindow, reverse: true, txFails: "P2002" });
    expect(await connectAtEventStep(raced.db, me, input, NOW)).toEqual({ status: "connected", matched: true });
    const broken = fakeDb({ event: inWindow, reverse: true, txFails: "P1001" });
    await expect(connectAtEventStep(broken.db, me, input, NOW)).rejects.toThrow("db");
  });
});
