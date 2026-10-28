import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { MeetupScreen } from "@/server/meetup/screen";
import { mobileError, type MobileContext } from "./guard";
import { cancelHandler, feedbackHandler, meetupScreenHandler, proposeCustomHandler, proposeHandler, respondHandler, shareLinkHandler } from "./meetup";

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

const screen = (overrides: Partial<MeetupScreen> = {}): MeetupScreen => ({
  matchId: "m1",
  other: { userId: "user-b", firstName: "Mina", photoUrl: "/api/dev-storage/profile-photos/u/p.jpg" },
  proposal: null,
  options: [],
  safeSpots: [{ id: "s1", name: "도서관", nameEn: "Library" }],
  customDays: [new Date("2026-10-28T15:00:00Z")],
  customBlocks: [4, 5, 6],
  emergencyContacts: [
    { key: "police", labelKo: "경찰", labelEn: "Police", phone: "112" },
    { key: "digitalSexCrime", labelKo: "x", labelEn: "y", phone: null, noteEn: "pending" },
  ],
  now: new Date("2026-10-28T03:00:00Z"),
  ...overrides,
});

describe("meetupScreenHandler", () => {
  const deps = (result: MeetupScreen | null, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getScreen: vi.fn(async () => result),
  });

  it("returns the planner with a full photo address, ISO dates and the emergency numbers (a missing number stays null)", async () => {
    const response = await meetupScreenHandler(ctx("/meetup/m1"), deps(screen()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.other.photoUrl).toBe(`${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg`);
    expect(body.now).toBe("2026-10-28T03:00:00.000Z");
    expect(body.customDays).toEqual(["2026-10-28T15:00:00.000Z"]);
    expect(body.proposal).toBeNull();
    expect(body.emergencyContacts).toEqual([
      { key: "police", labelKo: "경찰", labelEn: "Police", phone: "112" },
      { key: "digitalSexCrime", labelKo: "x", labelEn: "y", phone: null, noteEn: "pending" },
    ]);
  });

  it("serialises a live proposal, with share links as full addresses and no raw token field", async () => {
    const proposal = {
      proposalId: "p1",
      status: "ACCEPTED" as const,
      proposedByUserId: "user-b",
      scheduledStart: new Date("2026-11-02T05:00:00Z"),
      scheduledEnd: new Date("2026-11-02T07:00:00Z"),
      spotName: "도서관",
      spotNameEn: "Library",
      otherFirstName: "Mina",
      otherPhotoUrl: null,
      myFeedbackResponse: null,
      shareLinks: [{ id: "l1", token: "TOKEN123", expiresAt: new Date("2026-11-02T13:00:00Z"), revokedAt: null }],
    };
    const body = await (await meetupScreenHandler(ctx("/meetup/m1"), deps(screen({ proposal })))).json();
    expect(body.proposal.status).toBe("ACCEPTED");
    expect(body.proposal.shareLinks).toEqual([{ id: "l1", url: `${ORIGIN}/plan/TOKEN123`, expiresAt: "2026-11-02T13:00:00.000Z", revokedAt: null }]);
    expect(JSON.stringify(body)).not.toContain('"token"');
  });

  it("asks for the match named in the path, as the caller", async () => {
    const d = deps(screen());
    await meetupScreenHandler(ctx("/meetup/m1"), d);
    expect(d.getScreen).toHaveBeenCalledWith(person, "m1");
  });

  it("answers 404 for a match that is not the caller's (or has ended)", async () => {
    expect((await meetupScreenHandler(ctx("/meetup/m1"), deps(null))).status).toBe(404);
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps(screen(), mobileError("RATE_LIMITED"));
    expect((await meetupScreenHandler(ctx("/meetup/m1"), d)).status).toBe(429);
    expect(d.getScreen).not.toHaveBeenCalled();
  });
});

type ProposeResult = { status: "proposed" } | { status: "error"; code: "NOT_FOUND" | "UNMATCHED" | "ALREADY_PLANNED" | "INVALID_OPTION" };

describe("proposeHandler", () => {
  const deps = (result: ProposeResult, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    propose: vi.fn(async () => result),
  });
  const body = { spotId: "s1", day: 2, block: 8 };

  it("proposes for the match named in the path, as the caller", async () => {
    const d = deps({ status: "proposed" });
    const response = await proposeHandler(ctx("/meetup/m1/propose", "POST", body), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "proposed" });
    expect(d.propose).toHaveBeenCalledWith(person, "m1", body);
  });

  it("answers 404 for a match that is not the caller's", async () => {
    expect((await proposeHandler(ctx("/meetup/m1/propose", "POST", body), deps({ status: "error", code: "NOT_FOUND" }))).status).toBe(404);
  });

  it("answers 422 with the reason for UNMATCHED, ALREADY_PLANNED and INVALID_OPTION", async () => {
    for (const code of ["UNMATCHED", "ALREADY_PLANNED", "INVALID_OPTION"] as const) {
      const response = await proposeHandler(ctx("/meetup/m1/propose", "POST", body), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("refuses a malformed body or an unexpected field (400) without asking the database", async () => {
    for (const bad of [{ ...body, extra: 1 }, { ...body, block: 12 }, { ...body, day: -1 }, { spotId: "s1", day: 2 }, { ...body, day: "2" }]) {
      const d = deps({ status: "proposed" });
      const response = await proposeHandler(ctx("/meetup/m1/propose", "POST", bad), d);
      expect(response.status, JSON.stringify(bad)).toBe(400);
      expect(d.propose).not.toHaveBeenCalled();
    }
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "proposed" }, mobileError("RATE_LIMITED"));
    expect((await proposeHandler(ctx("/meetup/m1/propose", "POST", body), d)).status).toBe(429);
    expect(d.propose).not.toHaveBeenCalled();
  });
});

describe("proposeCustomHandler", () => {
  const deps = (result: ProposeResult) => ({ limit: vi.fn(async () => null), propose: vi.fn(async () => result) });
  const body = { spotId: "s1", dayOffset: 3, block: 6 };

  it("proposes a custom time for the match in the path", async () => {
    const d = deps({ status: "proposed" });
    const response = await proposeCustomHandler(ctx("/meetup/m1/propose-custom", "POST", body), d);
    expect(response.status).toBe(200);
    expect(d.propose).toHaveBeenCalledWith(person, "m1", body);
  });

  it("answers 422 INVALID_OPTION for a time the rules refuse, and 400 for a malformed body", async () => {
    const refused = await proposeCustomHandler(ctx("/meetup/m1/propose-custom", "POST", body), deps({ status: "error", code: "INVALID_OPTION" }));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "RULE_VIOLATION", reason: "INVALID_OPTION" });
    const d = deps({ status: "proposed" });
    expect((await proposeCustomHandler(ctx("/meetup/m1/propose-custom", "POST", { ...body, dayOffset: -1 }), d)).status).toBe(400);
    expect(d.propose).not.toHaveBeenCalled();
  });
});

describe("respondHandler", () => {
  type Result = { status: "accepted" | "declined" } | { status: "error"; code: "NOT_FOUND" | "NOT_PENDING" | "CANNOT_ACCEPT_OWN" };
  const deps = (result: Result) => ({ limit: vi.fn(async () => null), respond: vi.fn(async () => result) });

  it("passes the decision and proposal through", async () => {
    const d = deps({ status: "accepted" });
    const response = await respondHandler(ctx("/meetup/proposals/p1/respond", "POST", { decision: "ACCEPT" }), d);
    expect(await response.json()).toEqual({ status: "accepted" });
    expect(d.respond).toHaveBeenCalledWith(person, "p1", "ACCEPT");
  });

  it("refuses a decision that is neither ACCEPT nor DECLINE (400)", async () => {
    const d = deps({ status: "accepted" });
    expect((await respondHandler(ctx("/meetup/proposals/p1/respond", "POST", { decision: "MAYBE" }), d)).status).toBe(400);
    expect(d.respond).not.toHaveBeenCalled();
  });

  it("answers 404 / 422 with the reason", async () => {
    expect((await respondHandler(ctx("/meetup/proposals/p1/respond", "POST", { decision: "ACCEPT" }), deps({ status: "error", code: "NOT_FOUND" }))).status).toBe(404);
    for (const code of ["NOT_PENDING", "CANNOT_ACCEPT_OWN"] as const) {
      const response = await respondHandler(ctx("/meetup/proposals/p1/respond", "POST", { decision: "ACCEPT" }), deps({ status: "error", code }));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });
});

describe("cancelHandler, feedbackHandler and shareLinkHandler", () => {
  it("cancels the proposal in the path", async () => {
    const d = { limit: vi.fn(async () => null), cancel: vi.fn(async () => ({ status: "cancelled" as const })) };
    const response = await cancelHandler(ctx("/meetup/proposals/p1/cancel", "POST"), d);
    expect(await response.json()).toEqual({ status: "cancelled" });
    expect(d.cancel).toHaveBeenCalledWith(person, "p1");
  });

  it("answers 422 NOT_ACCEPTED when there is no confirmed meetup", async () => {
    const d = { limit: vi.fn(async () => null), cancel: vi.fn(async () => ({ status: "error" as const, code: "NOT_ACCEPTED" as const })) };
    const response = await cancelHandler(ctx("/meetup/proposals/p1/cancel", "POST"), d);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "NOT_ACCEPTED" });
  });

  it("saves a check-in answer, and refuses one that is not on the list (400)", async () => {
    const d = { limit: vi.fn(async () => null), submit: vi.fn(async () => ({ status: "saved" as const })) };
    const ok = await feedbackHandler(ctx("/meetup/proposals/p1/feedback", "POST", { response: "UNCOMFORTABLE" }), d);
    expect(await ok.json()).toEqual({ status: "saved" });
    expect(d.submit).toHaveBeenCalledWith(person, "p1", "UNCOMFORTABLE");
    d.submit.mockClear();
    expect((await feedbackHandler(ctx("/meetup/proposals/p1/feedback", "POST", { response: "AMAZING" }), d)).status).toBe(400);
    expect(d.submit).not.toHaveBeenCalled();
  });

  it("returns a full share-link address and its expiry", async () => {
    const d = {
      limit: vi.fn(async () => null),
      create: vi.fn(async () => ({ status: "created" as const, path: "/plan/TOKEN123", expiresAt: new Date("2026-11-02T13:00:00Z") })),
    };
    const response = await shareLinkHandler(ctx("/meetup/proposals/p1/share-link", "POST"), d);
    expect(await response.json()).toEqual({ status: "created", url: `${ORIGIN}/plan/TOKEN123`, expiresAt: "2026-11-02T13:00:00.000Z" });
    expect(d.create).toHaveBeenCalledWith(person, "p1");
  });

  it("stops every write at the rate limit before touching anything", async () => {
    const limited = mobileError("RATE_LIMITED");
    const cancel = { limit: vi.fn(async () => limited), cancel: vi.fn() };
    expect((await cancelHandler(ctx("/meetup/proposals/p1/cancel", "POST"), cancel)).status).toBe(429);
    expect(cancel.cancel).not.toHaveBeenCalled();
    const share = { limit: vi.fn(async () => mobileError("RATE_LIMITED")), create: vi.fn() };
    expect((await shareLinkHandler(ctx("/meetup/proposals/p1/share-link", "POST"), share)).status).toBe(429);
    expect(share.create).not.toHaveBeenCalled();
  });
});
