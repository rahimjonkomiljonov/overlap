import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { PrivacyOverview } from "@/server/privacy/queries";
import { mobileError, type MobileContext } from "./guard";
import { deleteAccountHandler, exportHandler, matchingPreferencesHandler, privacyOverviewHandler, setMatchingPreferencesHandler, withdrawConsentHandler } from "./privacy";

const ORIGIN = "https://overlaps.tech";
const actor = { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.SUSPENDED };
const ctx = (path: string, method = "GET", body?: unknown): MobileContext => ({
  actor,
  request: new Request(`${ORIGIN}/api/mobile/v1${path}`, {
    method,
    headers: body === undefined ? { cookie: "session=abc" } : { "content-type": "application/json", cookie: "session=abc" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
});
const limit = (limited: NextResponse | null = null) => vi.fn(async () => limited);
const limited = () => mobileError("RATE_LIMITED");

describe("privacyOverviewHandler", () => {
  const overview: PrivacyOverview = {
    consents: [{ type: "SENSITIVE_PREFERENCE", active: true, withdrawable: true, grantedAt: new Date("2026-10-01T00:00:00Z"), withdrawnAt: null }],
    dataRequests: [{ id: "r1", type: "ACCESS", status: "COMPLETED", createdAt: new Date("2026-10-02T00:00:00Z"), dueAt: new Date("2026-10-12T00:00:00Z"), completedAt: new Date("2026-10-02T00:00:00Z") }],
  };

  it("returns the person's consents and request history with ISO dates, for a restricted account too", async () => {
    const response = await privacyOverviewHandler(ctx("/privacy"), { limit: limit(), getOverview: vi.fn(async () => overview) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      consents: [{ type: "SENSITIVE_PREFERENCE", active: true, withdrawable: true, grantedAt: "2026-10-01T00:00:00.000Z", withdrawnAt: null }],
      dataRequests: [{ id: "r1", type: "ACCESS", status: "COMPLETED", createdAt: "2026-10-02T00:00:00.000Z", dueAt: "2026-10-12T00:00:00.000Z", completedAt: "2026-10-02T00:00:00.000Z" }],
    });
  });

  it("asks only for the caller's own overview, and stops at the rate limit first", async () => {
    const d = { limit: limit(), getOverview: vi.fn(async () => overview) };
    await privacyOverviewHandler(ctx("/privacy"), d);
    expect(d.getOverview).toHaveBeenCalledWith("user-a");
    const stopped = { limit: limit(limited()), getOverview: vi.fn() };
    expect((await privacyOverviewHandler(ctx("/privacy"), stopped)).status).toBe(429);
    expect(stopped.getOverview).not.toHaveBeenCalled();
  });
});

describe("exportHandler", () => {
  it("returns the export, which carries its own time", async () => {
    const d = { limit: limit(), exportData: vi.fn(async () => ({ status: "ready" as const, data: { exportedAt: "2026-10-29T00:00:00.000Z", account: { id: "user-a" } } as never })) };
    const response = await exportHandler(ctx("/privacy/export"), d);
    const body = await response.json();
    expect(body).toEqual({ data: { exportedAt: "2026-10-29T00:00:00.000Z", account: { id: "user-a" } } });
    expect(d.exportData).toHaveBeenCalledWith({ userId: "user-a" });
  });

  it("answers 404 when there is no such account, and stops at the (tight) rate limit before building anything", async () => {
    const none = { limit: limit(), exportData: vi.fn(async () => ({ status: "error" as const, code: "NOT_FOUND" as const })) };
    expect((await exportHandler(ctx("/privacy/export"), none)).status).toBe(404);
    const stopped = { limit: limit(limited()), exportData: vi.fn() };
    expect((await exportHandler(ctx("/privacy/export"), stopped)).status).toBe(429);
    expect(stopped.exportData).not.toHaveBeenCalled();
  });
});

describe("withdrawConsentHandler", () => {
  const deps = (result: { status: "withdrawn" } | { status: "error"; code: "NOT_ACTIVE" }) => ({ limit: limit(), withdraw: vi.fn(async () => result) });

  it("withdraws the named optional consent for the caller", async () => {
    const d = deps({ status: "withdrawn" });
    const response = await withdrawConsentHandler(ctx("/privacy/consents/withdraw", "POST", { type: "MARKETING" }), d);
    expect(await response.json()).toEqual({ status: "withdrawn", type: "MARKETING" });
    expect(d.withdraw).toHaveBeenCalledWith({ userId: "user-a" }, "MARKETING");
  });

  it("answers 422 NOT_ACTIVE when there is nothing to withdraw", async () => {
    const response = await withdrawConsentHandler(ctx("/privacy/consents/withdraw", "POST", { type: "MARKETING" }), deps({ status: "error", code: "NOT_ACTIVE" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "NOT_ACTIVE" });
  });

  it("refuses a required consent (Terms, Privacy) or anything unknown with 400, without touching the database", async () => {
    for (const type of ["TERMS", "PRIVACY_POLICY", "AGE", "", 5]) {
      const d = deps({ status: "withdrawn" });
      expect((await withdrawConsentHandler(ctx("/privacy/consents/withdraw", "POST", { type }), d)).status, String(type)).toBe(400);
      expect(d.withdraw).not.toHaveBeenCalled();
    }
  });
});

describe("deleteAccountHandler", () => {
  const deps = (l: NextResponse | null = null) => ({ limit: limit(l), deleteAccount: vi.fn(async () => ({ status: "deleted" as const, purgeAfter: new Date("2026-11-28T00:00:00Z") })) });

  it("deletes only with an explicit confirmation, reports when the data will be scrubbed, and passes the caller's own headers for the sign-out", async () => {
    const d = deps();
    const response = await deleteAccountHandler(ctx("/privacy/delete", "POST", { confirm: true }), d);
    expect(await response.json()).toEqual({ status: "deleted", purgeAfter: "2026-11-28T00:00:00.000Z" });
    expect(d.deleteAccount).toHaveBeenCalledWith({ userId: "user-a" }, expect.any(Headers));
    expect((d.deleteAccount.mock.calls[0] as unknown as [unknown, Headers])[1].get("cookie")).toBe("session=abc");
  });

  it("refuses anything but { confirm: true } (400) before deleting anything", async () => {
    for (const bad of [{}, { confirm: false }, { confirm: "true" }, { confirm: 1 }, { confirm: true, extra: 1 }]) {
      const d = deps();
      expect((await deleteAccountHandler(ctx("/privacy/delete", "POST", bad), d)).status, JSON.stringify(bad)).toBe(400);
      expect(d.deleteAccount).not.toHaveBeenCalled();
    }
    const noBody = deps();
    expect((await deleteAccountHandler(ctx("/privacy/delete", "POST"), noBody)).status).toBe(400);
    expect(noBody.deleteAccount).not.toHaveBeenCalled();
  });

  it("stops at the rate limit before deleting anything", async () => {
    const d = deps(limited());
    expect((await deleteAccountHandler(ctx("/privacy/delete", "POST", { confirm: true }), d)).status).toBe(429);
    expect(d.deleteAccount).not.toHaveBeenCalled();
  });
});

describe("matching preferences", () => {
  it("returns the sliders with the range they accept", async () => {
    const response = await matchingPreferencesHandler(ctx("/preferences/matching"), { limit: limit(), getSliders: vi.fn(async () => ({ classes: 1.25, interests: 1, freeTime: 0.5 })) });
    expect(await response.json()).toEqual({ classes: 1.25, interests: 1, freeTime: 0.5, min: 0.5, max: 1.5, step: 0.25 });
  });

  it("saves valid sliders for the caller, answering 422 when there is no profile yet", async () => {
    const d = { limit: limit(), setSliders: vi.fn(async () => ({ status: "saved" as const })) };
    const response = await setMatchingPreferencesHandler(ctx("/preferences/matching", "PUT", { classes: 1.5, interests: 0.5, freeTime: 1 }), d);
    expect(await response.json()).toEqual({ status: "saved", classes: 1.5, interests: 0.5, freeTime: 1 });
    expect(d.setSliders).toHaveBeenCalledWith({ userId: "user-a" }, { classes: 1.5, interests: 0.5, freeTime: 1 });
    const none = { limit: limit(), setSliders: vi.fn(async () => ({ status: "error" as const, code: "NO_PROFILE" as const })) };
    const r = await setMatchingPreferencesHandler(ctx("/preferences/matching", "PUT", { classes: 1, interests: 1, freeTime: 1 }), none);
    expect(r.status).toBe(422);
    expect((await r.json()).reason).toBe("NO_PROFILE");
  });

  it("refuses sliders outside 0.5 to 1.5, off the 0.25 steps, not numbers, or incomplete (400)", async () => {
    for (const bad of [{ classes: 2, interests: 1, freeTime: 1 }, { classes: 0.25, interests: 1, freeTime: 1 }, { classes: 1.1, interests: 1, freeTime: 1 }, { classes: "1", interests: 1, freeTime: 1 }, { classes: 1, interests: 1 }, { classes: 1, interests: 1, freeTime: 1, extra: 1 }]) {
      const d = { limit: limit(), setSliders: vi.fn() };
      expect((await setMatchingPreferencesHandler(ctx("/preferences/matching", "PUT", bad), d)).status, JSON.stringify(bad)).toBe(400);
      expect(d.setSliders).not.toHaveBeenCalled();
    }
  });
});
