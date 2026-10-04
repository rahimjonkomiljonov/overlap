import { describe, expect, it } from "vitest";
import {
  canRsvp,
  CONNECT_WINDOW_MS,
  eventPhase,
  overlapCount,
  parseSeoulLocalDateTime,
  rankByOverlap,
} from "./rules";

const startsAt = new Date("2026-10-10T10:00:00Z");
const endsAt = new Date("2026-10-10T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("eventPhase", () => {
  it("moves through upcoming, ongoing, the 48h connect window, then closed", () => {
    const e = { startsAt, endsAt, cancelledAt: null };
    expect(eventPhase(e, at("2026-10-10T09:59:59Z"))).toBe("upcoming");
    expect(eventPhase(e, startsAt)).toBe("ongoing");
    expect(eventPhase(e, endsAt)).toBe("connect");
    expect(eventPhase(e, new Date(endsAt.getTime() + CONNECT_WINDOW_MS - 1))).toBe("connect");
    expect(eventPhase(e, new Date(endsAt.getTime() + CONNECT_WINDOW_MS))).toBe("closed");
  });

  it("treats a cancelled event as cancelled at any time", () => {
    expect(eventPhase({ startsAt, endsAt, cancelledAt: startsAt }, endsAt)).toBe("cancelled");
  });

  it("allows RSVPs only before the event ends", () => {
    expect(canRsvp("upcoming")).toBe(true);
    expect(canRsvp("ongoing")).toBe(true);
    expect(canRsvp("connect")).toBe(false);
    expect(canRsvp("cancelled")).toBe(false);
  });
});

describe("parseSeoulLocalDateTime", () => {
  it("reads a datetime-local value as Seoul time (UTC+9)", () => {
    expect(parseSeoulLocalDateTime("2026-10-10T19:00")?.toISOString()).toBe(
      "2026-10-10T10:00:00.000Z",
    );
  });

  it("rejects anything that isn't a plain datetime-local value", () => {
    expect(parseSeoulLocalDateTime("2026-10-10")).toBeNull();
    expect(parseSeoulLocalDateTime("2026-10-10T19:00Z")).toBeNull();
    expect(parseSeoulLocalDateTime("not a date")).toBeNull();
    expect(parseSeoulLocalDateTime("2026-13-40T19:00")).toBeNull();
  });
});

describe("overlap ranking", () => {
  const viewer = {
    userId: "me",
    courseIds: ["c1", "c2"],
    clubIds: ["k1"],
    interestTagIds: ["i1", "i2"],
  };

  it("counts shared courses, clubs and interests, ignoring duplicates", () => {
    const other = { userId: "a", courseIds: ["c1", "c1"], clubIds: ["k1"], interestTagIds: ["i3"] };
    expect(overlapCount(viewer, other)).toBe(2);
  });

  it("orders by overlap, keeping RSVP order for ties", () => {
    const none = { userId: "none", courseIds: [], clubIds: [], interestTagIds: [] };
    const tieA = { userId: "tieA", courseIds: ["c1"], clubIds: [], interestTagIds: [] };
    const tieB = { userId: "tieB", courseIds: [], clubIds: ["k1"], interestTagIds: [] };
    const most = {
      userId: "most",
      courseIds: ["c1", "c2"],
      clubIds: ["k1"],
      interestTagIds: ["i1"],
    };
    const ranked = rankByOverlap(viewer, [none, tieA, tieB, most]);
    expect(ranked.map((r) => [r.userId, r.overlap])).toEqual([
      ["most", 4],
      ["tieA", 1],
      ["tieB", 1],
      ["none", 0],
    ]);
  });
});
