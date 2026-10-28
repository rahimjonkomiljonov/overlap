import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { MyPockets, PocketDetail } from "@/server/pockets/queries";
import { mobileError, type MobileContext } from "./guard";
import {
  pocketDetailHandler,
  pocketsListHandler,
  pocketWaveHandler,
  setPocketsVisibleHandler,
} from "./pockets";

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

const mine = (overrides: Partial<MyPockets> = {}): MyPockets => ({
  verified: true,
  visible: true,
  hasPocketIntent: true,
  pockets: [{ kind: "course", id: "c1", label: "CS201 · Data Structures", memberCount: 4 }],
  ...overrides,
});

const detail = (overrides: Partial<PocketDetail> = {}): PocketDetail => ({
  verified: true,
  visible: true,
  hasPocketIntent: true,
  label: "CS201 · Data Structures",
  members: [
    {
      userId: "SECRET-user-id",
      firstName: "Mina",
      year: 2,
      photoUrl: "/api/dev-storage/profile-photos/u/p.jpg",
      intents: ["FRIENDS", "STUDY"],
      alsoShared: 1,
      waved: false,
      matched: false,
    },
  ],
  ...overrides,
});

describe("pocketsListHandler", () => {
  const deps = (data: MyPockets, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getMyPockets: vi.fn(async () => data),
  });

  it("returns the caller's pockets", async () => {
    const response = await pocketsListHandler(ctx("/pockets"), deps(mine()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mine());
  });

  it("asks for the language it was told to and defaults to English", async () => {
    const d = deps(mine());
    await pocketsListHandler(ctx("/pockets"), d);
    expect(d.getMyPockets).toHaveBeenLastCalledWith({ userId: "user-a", campusId: "campus-1" }, "en");
    await pocketsListHandler(ctx("/pockets?locale=ko"), d);
    expect(d.getMyPockets).toHaveBeenLastCalledWith({ userId: "user-a", campusId: "campus-1" }, "ko");
  });

  it("refuses an unknown language or an unknown parameter (400)", async () => {
    for (const query of ["?locale=fr", "?x=1"]) {
      const response = await pocketsListHandler(ctx(`/pockets${query}`), deps(mine()));
      expect(response.status).toBe(400);
    }
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps(mine(), mobileError("RATE_LIMITED"));
    const response = await pocketsListHandler(ctx("/pockets"), d);
    expect(response.status).toBe(429);
    expect(d.limit).toHaveBeenCalledWith("pockets:user-a");
    expect(d.getMyPockets).not.toHaveBeenCalled();
  });
});

describe("setPocketsVisibleHandler", () => {
  const deps = (limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    setVisible: vi.fn(async () => undefined),
  });

  it("turns Pockets on", async () => {
    const d = deps();
    const response = await setPocketsVisibleHandler(ctx("/pockets/visibility", "PUT", { visible: true }), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ visible: true });
    expect(d.setVisible).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, true);
  });

  it("refuses a non-boolean or an unexpected field (400)", async () => {
    const d = deps();
    for (const body of [{ visible: "true" }, { visible: true, extra: 1 }, {}]) {
      const response = await setPocketsVisibleHandler(ctx("/pockets/visibility", "PUT", body), d);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(d.setVisible).not.toHaveBeenCalled();
    }
  });

  it("stops at the rate limit before writing anything", async () => {
    const d = deps(mobileError("RATE_LIMITED"));
    const response = await setPocketsVisibleHandler(
      ctx("/pockets/visibility", "PUT", { visible: false }),
      d,
    );
    expect(response.status).toBe(429);
    expect(d.setVisible).not.toHaveBeenCalled();
  });
});

describe("pocketDetailHandler", () => {
  const deps = (data: PocketDetail | null, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getPocket: vi.fn(async () => data),
  });

  it("returns the pocket, with photo addresses made absolute", async () => {
    const response = await pocketDetailHandler(ctx("/pockets/course/c1"), deps(detail()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.label).toBe("CS201 · Data Structures");
    expect(body.members[0].photoUrl).toBe(`${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg`);
  });

  it("never carries the member's user id under any other name, and nothing beyond the listed fields", async () => {
    const response = await pocketDetailHandler(ctx("/pockets/course/c1"), deps(detail()));
    const body = await response.json();
    expect(Object.keys(body.members[0]).sort()).toEqual(
      ["alsoShared", "firstName", "intents", "matched", "photoUrl", "userId", "waved", "year"].sort(),
    );
  });

  it("passes the kind and id from the path to the lookup", async () => {
    const d = deps(detail());
    await pocketDetailHandler(ctx("/pockets/club/k9"), d);
    expect(d.getPocket).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "club", "k9", "en");
  });

  it("is 404 for a pocket kind that is not course or club, without asking the database", async () => {
    const d = deps(detail());
    const response = await pocketDetailHandler(ctx("/pockets/event/c1"), d);
    expect(response.status).toBe(404);
    expect(d.getPocket).not.toHaveBeenCalled();
  });

  it("is 404 when the lookup finds nothing (not the caller's own course/club, or another campus)", async () => {
    const response = await pocketDetailHandler(ctx("/pockets/course/not-mine"), deps(null));
    expect(response.status).toBe(404);
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps(detail(), mobileError("RATE_LIMITED"));
    const response = await pocketDetailHandler(ctx("/pockets/course/c1"), d);
    expect(response.status).toBe(429);
    expect(d.getPocket).not.toHaveBeenCalled();
  });
});

describe("pocketWaveHandler", () => {
  type Result =
    | { status: "sent"; matched: boolean }
    | { status: "error"; code: "NOT_FOUND" | "BLOCKED" | "DAILY_CAP_REACHED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    wave: vi.fn(async () => result),
  });
  const body = { kind: "course", pocketId: "c1", toUserId: "them" };

  it("sends the wave as the caller", async () => {
    const d = deps({ status: "sent", matched: false });
    const response = await pocketWaveHandler(ctx("/pockets/wave", "POST", body), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent", matched: false });
    expect(d.wave).toHaveBeenCalledWith(
      { userId: "user-a", campusId: "campus-1" },
      "course",
      "c1",
      "them",
      undefined,
    );
  });

  it("reports a match", async () => {
    const response = await pocketWaveHandler(
      ctx("/pockets/wave", "POST", body),
      deps({ status: "sent", matched: true }),
    );
    expect(await response.json()).toEqual({ status: "sent", matched: true });
  });

  it("passes a note through", async () => {
    const d = deps({ status: "sent", matched: false });
    await pocketWaveHandler(ctx("/pockets/wave", "POST", { ...body, note: "same class!" }), d);
    expect(d.wave).toHaveBeenCalledWith(expect.anything(), "course", "c1", "them", "same class!");
  });

  it("answers 404 for someone not currently a member of that pocket", async () => {
    const response = await pocketWaveHandler(
      ctx("/pockets/wave", "POST", body),
      deps({ status: "error", code: "NOT_FOUND" }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("answers 422 BLOCKED for a blocked pair", async () => {
    const response = await pocketWaveHandler(
      ctx("/pockets/wave", "POST", body),
      deps({ status: "error", code: "BLOCKED" }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "BLOCKED" });
  });

  it("answers 422 DAILY_CAP_REACHED at the cap", async () => {
    const response = await pocketWaveHandler(
      ctx("/pockets/wave", "POST", body),
      deps({ status: "error", code: "DAILY_CAP_REACHED" }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "DAILY_CAP_REACHED" });
  });

  it("refuses a malformed body (400)", async () => {
    const d = deps({ status: "sent", matched: false });
    for (const bad of [{}, { ...body, kind: "event" }, { ...body, extra: 1 }]) {
      const response = await pocketWaveHandler(ctx("/pockets/wave", "POST", bad), d);
      expect(response.status, JSON.stringify(bad)).toBe(400);
    }
    expect(d.wave).not.toHaveBeenCalled();
  });

  it("stops at the rate limit before waving at anyone", async () => {
    const d = deps({ status: "sent", matched: false }, mobileError("RATE_LIMITED"));
    const response = await pocketWaveHandler(ctx("/pockets/wave", "POST", body), d);
    expect(response.status).toBe(429);
    expect(d.wave).not.toHaveBeenCalled();
  });
});
