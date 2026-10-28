import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { IncomingWave } from "@/server/waves/queries";
import { mobileError, type MobileContext } from "./guard";
import { declineWaveHandler, pickWaveHandler, waveBackHandler, wavesListHandler } from "./waves";

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

describe("pickWaveHandler", () => {
  type Result =
    | { status: "sent"; matched: boolean }
    | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" | "BLOCKED" | "DAILY_CAP_REACHED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    wave: vi.fn(async () => result),
  });

  it("waves on the pick named in the path, as the caller", async () => {
    const d = deps({ status: "sent", matched: false });
    const response = await pickWaveHandler(ctx("/picks/item-1/wave", "POST", {}), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent", batchItemId: "item-1", matched: false });
    expect(d.wave).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "item-1", undefined);
  });

  it("passes a note through", async () => {
    const d = deps({ status: "sent", matched: false });
    await pickWaveHandler(ctx("/picks/item-1/wave", "POST", { note: "let's study!" }), d);
    expect(d.wave).toHaveBeenCalledWith(expect.anything(), "item-1", "let's study!");
  });

  it("reports a match", async () => {
    const response = await pickWaveHandler(
      ctx("/picks/item-1/wave", "POST", {}),
      deps({ status: "sent", matched: true }),
    );
    expect((await response.json()).matched).toBe(true);
  });

  it("answers 404 for a pick that is not the caller's, exactly like one that does not exist", async () => {
    const response = await pickWaveHandler(
      ctx("/picks/item-9/wave", "POST", {}),
      deps({ status: "error", code: "NOT_FOUND" }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("answers 422 for ALREADY_DECIDED, BLOCKED and DAILY_CAP_REACHED", async () => {
    for (const code of ["ALREADY_DECIDED", "BLOCKED", "DAILY_CAP_REACHED"] as const) {
      const response = await pickWaveHandler(ctx("/picks/item-1/wave", "POST", {}), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("treats an id with odd characters as not found, without asking the database", async () => {
    for (const bad of ["a%2F..%2Fb", "x;drop", "a".repeat(65)]) {
      const d = deps({ status: "sent", matched: false });
      const response = await pickWaveHandler(ctx(`/picks/${bad}/wave`, "POST", {}), d);
      expect(response.status, bad).toBe(404);
      expect(d.wave).not.toHaveBeenCalled();
    }
  });

  it("refuses an unexpected body field (400)", async () => {
    const d = deps({ status: "sent", matched: false });
    const response = await pickWaveHandler(ctx("/picks/item-1/wave", "POST", { extra: 1 }), d);
    expect(response.status).toBe(400);
    expect(d.wave).not.toHaveBeenCalled();
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "sent", matched: false }, mobileError("RATE_LIMITED"));
    const response = await pickWaveHandler(ctx("/picks/item-1/wave", "POST", {}), d);
    expect(response.status).toBe(429);
    expect(d.wave).not.toHaveBeenCalled();
  });
});

describe("wavesListHandler", () => {
  const wave = (overrides: Partial<IncomingWave> = {}): IncomingWave => ({
    waveId: "w1",
    fromUserId: "SECRET-user-id",
    firstName: "Mina",
    photoUrl: "/api/dev-storage/profile-photos/u/p.jpg",
    note: "Same section!",
    targetElement: { type: "profile" },
    createdAt: new Date("2026-10-28T03:00:00Z"),
    ...overrides,
  });
  const deps = (waves: IncomingWave[], limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getIncomingWaves: vi.fn(async () => waves),
  });

  it("returns pending waves with full photo addresses", async () => {
    const response = await wavesListHandler(ctx("/waves"), deps([wave()]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      waves: [
        {
          id: "w1",
          fromUserId: "SECRET-user-id",
          firstName: "Mina",
          photoUrl: `${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg`,
          note: "Same section!",
          targetElement: { type: "profile" },
          createdAt: "2026-10-28T03:00:00.000Z",
        },
      ],
    });
  });

  it("asks for the caller's own waves", async () => {
    const d = deps([]);
    await wavesListHandler(ctx("/waves"), d);
    expect(d.getIncomingWaves).toHaveBeenCalledWith("user-a");
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps([wave()], mobileError("RATE_LIMITED"));
    const response = await wavesListHandler(ctx("/waves"), d);
    expect(response.status).toBe(429);
    expect(d.getIncomingWaves).not.toHaveBeenCalled();
  });
});

describe("waveBackHandler", () => {
  type Result =
    | { status: "matched" }
    | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" | "BLOCKED" | "DAILY_CAP_REACHED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    waveBack: vi.fn(async () => result),
  });

  it("waves back as the caller and reports a match", async () => {
    const d = deps({ status: "matched" });
    const response = await waveBackHandler(ctx("/waves/w1/wave-back", "POST", {}), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "matched" });
    expect(d.waveBack).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "w1", undefined);
  });

  it("passes a note through", async () => {
    const d = deps({ status: "matched" });
    await waveBackHandler(ctx("/waves/w1/wave-back", "POST", { note: "see you then" }), d);
    expect(d.waveBack).toHaveBeenCalledWith(expect.anything(), "w1", "see you then");
  });

  it("answers 404 for someone else's wave", async () => {
    const response = await waveBackHandler(
      ctx("/waves/w1/wave-back", "POST", {}),
      deps({ status: "error", code: "NOT_FOUND" }),
    );
    expect(response.status).toBe(404);
  });

  it("answers 422 for ALREADY_DECIDED, BLOCKED and DAILY_CAP_REACHED", async () => {
    for (const code of ["ALREADY_DECIDED", "BLOCKED", "DAILY_CAP_REACHED"] as const) {
      const response = await waveBackHandler(ctx("/waves/w1/wave-back", "POST", {}), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "matched" }, mobileError("RATE_LIMITED"));
    const response = await waveBackHandler(ctx("/waves/w1/wave-back", "POST", {}), d);
    expect(response.status).toBe(429);
    expect(d.waveBack).not.toHaveBeenCalled();
  });
});

describe("declineWaveHandler", () => {
  type Result = { status: "declined" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    decline: vi.fn(async () => result),
  });

  it("declines the wave named in the path, as the caller", async () => {
    const d = deps({ status: "declined" });
    const response = await declineWaveHandler(ctx("/waves/w1/decline", "POST"), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "declined" });
    expect(d.decline).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "w1");
  });

  it("answers 404 for someone else's wave", async () => {
    const response = await declineWaveHandler(
      ctx("/waves/w1/decline", "POST"),
      deps({ status: "error", code: "NOT_FOUND" }),
    );
    expect(response.status).toBe(404);
  });

  it("answers 422 ALREADY_DECIDED for a wave already decided", async () => {
    const response = await declineWaveHandler(
      ctx("/waves/w1/decline", "POST"),
      deps({ status: "error", code: "ALREADY_DECIDED" }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "ALREADY_DECIDED" });
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "declined" }, mobileError("RATE_LIMITED"));
    const response = await declineWaveHandler(ctx("/waves/w1/decline", "POST"), d);
    expect(response.status).toBe(429);
    expect(d.decline).not.toHaveBeenCalled();
  });
});
