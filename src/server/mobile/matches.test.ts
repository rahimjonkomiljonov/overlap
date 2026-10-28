import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { MatchSummary } from "@/server/waves/queries";
import { mobileError, type MobileContext } from "./guard";
import { matchesListHandler, unmatchHandler } from "./matches";

const ORIGIN = "https://overlaps.tech";
const actor = { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE };
const ctx = (path: string, method = "GET"): MobileContext => ({
  actor,
  request: new Request(`${ORIGIN}/api/mobile/v1${path}`, { method }),
});

describe("matchesListHandler", () => {
  const match = (overrides: Partial<MatchSummary> = {}): MatchSummary => ({
    matchId: "m1",
    conversationId: "c1",
    otherUserId: "SECRET-user-id",
    firstName: "Mina",
    photoUrl: "/api/dev-storage/profile-photos/u/p.jpg",
    matchedAt: new Date("2026-10-28T03:00:00Z"),
    meetup: null,
    ...overrides,
  });
  const deps = (matches: MatchSummary[], limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getMatches: vi.fn(async () => matches),
  });

  it("returns active matches with full photo addresses", async () => {
    const response = await matchesListHandler(ctx("/matches"), deps([match()]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      matches: [
        {
          matchId: "m1",
          conversationId: "c1",
          otherUserId: "SECRET-user-id",
          firstName: "Mina",
          photoUrl: `${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg`,
          matchedAt: "2026-10-28T03:00:00.000Z",
        },
      ],
    });
  });

  it("asks for the caller's own matches", async () => {
    const d = deps([]);
    await matchesListHandler(ctx("/matches"), d);
    expect(d.getMatches).toHaveBeenCalledWith("user-a");
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps([match()], mobileError("RATE_LIMITED"));
    const response = await matchesListHandler(ctx("/matches"), d);
    expect(response.status).toBe(429);
    expect(d.getMatches).not.toHaveBeenCalled();
  });
});

describe("unmatchHandler", () => {
  type Result = { status: "unmatched" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    unmatch: vi.fn(async () => result),
  });

  it("ends the match named in the path, as the caller", async () => {
    const d = deps({ status: "unmatched" });
    const response = await unmatchHandler(ctx("/matches/m1/unmatch", "POST"), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unmatched" });
    expect(d.unmatch).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "m1");
  });

  it("answers 404 for someone else's match", async () => {
    const response = await unmatchHandler(ctx("/matches/m1/unmatch", "POST"), deps({ status: "error", code: "NOT_FOUND" }));
    expect(response.status).toBe(404);
  });

  it("answers 422 ALREADY_DECIDED for a match already ended", async () => {
    const response = await unmatchHandler(ctx("/matches/m1/unmatch", "POST"), deps({ status: "error", code: "ALREADY_DECIDED" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "ALREADY_DECIDED" });
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "unmatched" }, mobileError("RATE_LIMITED"));
    const response = await unmatchHandler(ctx("/matches/m1/unmatch", "POST"), d);
    expect(response.status).toBe(429);
    expect(d.unmatch).not.toHaveBeenCalled();
  });
});
