import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { SafetyScreen } from "@/server/safety/service";
import { mobileError, type MobileContext } from "./guard";
import {
  appealHandler,
  blockHandler,
  fileReportHandler,
  hideClubHandler,
  hideCourseHandler,
  hideEmailHandler,
  safetyScreenHandler,
  setIncognitoHandler,
  setPausedHandler,
  trustAppealHandler,
  unblockHandler,
  unhideHandler,
} from "./safety";

const ORIGIN = "https://overlaps.tech";
const actor = { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE };
const ctx = (path: string, method = "GET", body?: unknown, status: UserStatus = UserStatus.ACTIVE): MobileContext => ({
  actor: { ...actor, status },
  request: new Request(`${ORIGIN}/api/mobile/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
});
const person = { userId: "user-a", campusId: "campus-1" };
const limit = (limited: NextResponse | null = null) => vi.fn(async () => limited);
const limited = () => mobileError("RATE_LIMITED");

const screen = (overrides: Partial<SafetyScreen> = {}): SafetyScreen => ({
  status: "SUSPENDED",
  suspendedUntil: new Date("2026-11-04T00:00:00Z"),
  settings: { paused: false, incognito: true, blocked: [{ userId: "u2", name: "Jun" }], hidden: [] },
  courses: [{ id: "c1", code: "CS201", title: "Data Structures" }],
  clubs: [],
  actions: [{ id: "a1", type: "WARN", reason: "rude", createdAt: new Date("2026-10-28T00:00:00Z"), appealNote: null, appealedAt: null }],
  trust: { limited: true, reasons: [], restoredUntil: null, openAppeal: { createdAt: new Date("2026-10-29T00:00:00Z") }, lastDecision: null } as unknown as SafetyScreen["trust"],
  ...overrides,
});

describe("safetyScreenHandler", () => {
  it("returns the person's own safety state with ISO dates", async () => {
    const response = await safetyScreenHandler(ctx("/safety"), { limit: limit(), getScreen: vi.fn(async () => screen()) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("SUSPENDED");
    expect(body.suspendedUntil).toBe("2026-11-04T00:00:00.000Z");
    expect(body.incognito).toBe(true);
    expect(body.blocked).toEqual([{ userId: "u2", name: "Jun" }]);
    expect(body.actions[0]).toEqual({ id: "a1", type: "WARN", reason: "rude", createdAt: "2026-10-28T00:00:00.000Z", appealNote: null, appealedAt: null });
    expect(body.trust.openAppealSince).toBe("2026-10-29T00:00:00.000Z");
  });

  it("asks for the caller's own state, and stops at the rate limit first", async () => {
    const d = { limit: limit(), getScreen: vi.fn(async () => screen()) };
    await safetyScreenHandler(ctx("/safety"), d);
    expect(d.getScreen).toHaveBeenCalledWith(person);
    const stopped = { limit: limit(limited()), getScreen: vi.fn() };
    expect((await safetyScreenHandler(ctx("/safety"), stopped)).status).toBe(429);
    expect(stopped.getScreen).not.toHaveBeenCalled();
  });
});

describe("setPausedHandler and setIncognitoHandler", () => {
  it("passes the caller's own status to the pause step, so a restricted account is refused there", async () => {
    const d = { limit: limit(), setPaused: vi.fn(async () => ({ status: "saved" as const })) };
    const response = await setPausedHandler(ctx("/safety/paused", "PUT", { paused: true }, UserStatus.PAUSED), d);
    expect(await response.json()).toEqual({ status: "saved", paused: true });
    expect(d.setPaused).toHaveBeenCalledWith({ userId: "user-a", status: UserStatus.PAUSED }, true);
    const refused = { limit: limit(), setPaused: vi.fn(async () => ({ status: "error" as const, code: "ACCOUNT_RESTRICTED" as const })) };
    const r = await setPausedHandler(ctx("/safety/paused", "PUT", { paused: false }, UserStatus.SUSPENDED), refused);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "RULE_VIOLATION", reason: "ACCOUNT_RESTRICTED" });
  });

  it("refuses a body that is not a boolean (400), and stops at the rate limit", async () => {
    for (const bad of [{}, { paused: "true" }, { paused: true, extra: 1 }]) {
      const d = { limit: limit(), setPaused: vi.fn() };
      expect((await setPausedHandler(ctx("/safety/paused", "PUT", bad), d)).status).toBe(400);
      expect(d.setPaused).not.toHaveBeenCalled();
    }
    const d = { limit: limit(limited()), setIncognito: vi.fn() };
    expect((await setIncognitoHandler(ctx("/safety/incognito", "PUT", { incognito: true }), d)).status).toBe(429);
    expect(d.setIncognito).not.toHaveBeenCalled();
  });

  it("sets incognito for the caller", async () => {
    const d = { limit: limit(), setIncognito: vi.fn(async () => ({ status: "saved" as const })) };
    const response = await setIncognitoHandler(ctx("/safety/incognito", "PUT", { incognito: true }), d);
    expect(await response.json()).toEqual({ status: "saved", incognito: true });
    expect(d.setIncognito).toHaveBeenCalledWith({ userId: "user-a" }, true);
  });
});

describe("fileReportHandler", () => {
  type Result = { status: "filed" } | { status: "error"; code: "CANNOT_REPORT_SELF" | "NOT_FOUND" | "INVALID_CONVERSATION" };
  const deps = (result: Result, l: NextResponse | null = null) => ({ limit: limit(l), fileReport: vi.fn(async () => result) });
  const body = { targetUserId: "u2", category: "HARASSMENT", description: "rude", conversationId: "c1" };

  it("files the report, and says the person is already hidden", async () => {
    const d = deps({ status: "filed" });
    const response = await fileReportHandler(ctx("/reports", "POST", body), d);
    expect(await response.json()).toEqual({ status: "filed", hidden: true });
    expect(d.fileReport).toHaveBeenCalledWith({ userId: "user-a" }, body);
  });

  it("answers 404, and 422 with the reason", async () => {
    expect((await fileReportHandler(ctx("/reports", "POST", body), deps({ status: "error", code: "NOT_FOUND" }))).status).toBe(404);
    for (const code of ["CANNOT_REPORT_SELF", "INVALID_CONVERSATION"] as const) {
      const response = await fileReportHandler(ctx("/reports", "POST", body), deps({ status: "error", code }));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("refuses a category that is not on the list, a too-long description or an unexpected field (400)", async () => {
    for (const bad of [{ ...body, category: "RUDE" }, { ...body, description: "x".repeat(501) }, { ...body, extra: 1 }, { category: "SPAM" }]) {
      const d = deps({ status: "filed" });
      expect((await fileReportHandler(ctx("/reports", "POST", bad), d)).status, JSON.stringify(bad)).toBe(400);
      expect(d.fileReport).not.toHaveBeenCalled();
    }
  });

  it("stops at the rate limit before filing anything", async () => {
    const d = deps({ status: "filed" }, limited());
    expect((await fileReportHandler(ctx("/reports", "POST", body), d)).status).toBe(429);
    expect(d.fileReport).not.toHaveBeenCalled();
  });
});

describe("block and unblock", () => {
  it("blocks the person named in the body, and answers 404 or 422 from the step", async () => {
    const d = { limit: limit(), block: vi.fn(async () => ({ status: "blocked" as const })) };
    expect(await (await blockHandler(ctx("/blocks", "POST", { targetUserId: "u2", reason: "x" }), d)).json()).toEqual({ status: "blocked" });
    expect(d.block).toHaveBeenCalledWith({ userId: "user-a" }, { targetUserId: "u2", reason: "x" });
    const missing = { limit: limit(), block: vi.fn(async () => ({ status: "error" as const, code: "NOT_FOUND" as const })) };
    expect((await blockHandler(ctx("/blocks", "POST", { targetUserId: "u2" }), missing)).status).toBe(404);
    const self = { limit: limit(), block: vi.fn(async () => ({ status: "error" as const, code: "CANNOT_BLOCK_SELF" as const })) };
    const r = await blockHandler(ctx("/blocks", "POST", { targetUserId: "user-a" }), self);
    expect(r.status).toBe(422);
    expect((await r.json()).reason).toBe("CANNOT_BLOCK_SELF");
  });

  it("refuses an over-long reason (400), and unblocks the person in the path", async () => {
    const d = { limit: limit(), block: vi.fn() };
    expect((await blockHandler(ctx("/blocks", "POST", { targetUserId: "u2", reason: "x".repeat(501) }), d)).status).toBe(400);
    expect(d.block).not.toHaveBeenCalled();
    const u = { limit: limit(), unblock: vi.fn(async () => ({ status: "unblocked" as const })) };
    expect(await (await unblockHandler(ctx("/blocks/u2", "DELETE"), u)).json()).toEqual({ status: "unblocked" });
    expect(u.unblock).toHaveBeenCalledWith({ userId: "user-a" }, "u2");
  });
});

describe("hide-from", () => {
  const ok = { status: "hidden" as const, count: 3 };

  it("hides a course, a club or an email for the caller", async () => {
    const course = { limit: limit(), hide: vi.fn(async () => ok) };
    expect(await (await hideCourseHandler(ctx("/hides/course", "POST", { courseId: "c1" }), course)).json()).toEqual({ status: "hidden", count: 3 });
    expect(course.hide).toHaveBeenCalledWith({ userId: "user-a" }, "c1");
    const club = { limit: limit(), hide: vi.fn(async () => ok) };
    await hideClubHandler(ctx("/hides/club", "POST", { clubId: "k1" }), club);
    expect(club.hide).toHaveBeenCalledWith({ userId: "user-a" }, "k1");
    const email = { limit: limit(), hide: vi.fn(async () => ok) };
    await hideEmailHandler(ctx("/hides/email", "POST", { email: " Jun@School.ac.kr " }), email);
    expect(email.hide).toHaveBeenCalledWith({ userId: "user-a" }, "jun@school.ac.kr");
  });

  it("answers 404 for an email with no account, 422 for your own, and 400 for a malformed email", async () => {
    const none = { limit: limit(), hide: vi.fn(async () => ({ status: "error" as const, code: "NOT_FOUND" as const })) };
    expect((await hideEmailHandler(ctx("/hides/email", "POST", { email: "x@school.ac.kr" }), none)).status).toBe(404);
    const self = { limit: limit(), hide: vi.fn(async () => ({ status: "error" as const, code: "CANNOT_HIDE_SELF" as const })) };
    expect((await hideEmailHandler(ctx("/hides/email", "POST", { email: "me@school.ac.kr" }), self)).status).toBe(422);
    const bad = { limit: limit(), hide: vi.fn() };
    expect((await hideEmailHandler(ctx("/hides/email", "POST", { email: "not-an-email" }), bad)).status).toBe(400);
    expect(bad.hide).not.toHaveBeenCalled();
  });

  it("unhides the person in the path, and stops at the rate limit", async () => {
    const d = { limit: limit(), unhide: vi.fn(async () => ({ status: "unhidden" as const })) };
    expect(await (await unhideHandler(ctx("/hides/u2", "DELETE"), d)).json()).toEqual({ status: "unhidden" });
    expect(d.unhide).toHaveBeenCalledWith({ userId: "user-a" }, "u2");
    const stopped = { limit: limit(limited()), hide: vi.fn() };
    expect((await hideCourseHandler(ctx("/hides/course", "POST", { courseId: "c1" }), stopped)).status).toBe(429);
    expect(stopped.hide).not.toHaveBeenCalled();
  });
});

describe("appeals", () => {
  it("submits an appeal on an action, answering 404 and 422 ALREADY_APPEALED from the step", async () => {
    const d = { limit: limit(), appeal: vi.fn(async () => ({ status: "submitted" as const })) };
    const body = { moderationActionId: "a1", appealNote: "mistake" };
    expect(await (await appealHandler(ctx("/safety/appeals", "POST", body), d)).json()).toEqual({ status: "submitted" });
    expect(d.appeal).toHaveBeenCalledWith({ userId: "user-a" }, body);
    const gone = { limit: limit(), appeal: vi.fn(async () => ({ status: "error" as const, code: "NOT_FOUND" as const })) };
    expect((await appealHandler(ctx("/safety/appeals", "POST", body), gone)).status).toBe(404);
    const twice = { limit: limit(), appeal: vi.fn(async () => ({ status: "error" as const, code: "ALREADY_APPEALED" as const })) };
    const r = await appealHandler(ctx("/safety/appeals", "POST", body), twice);
    expect(r.status).toBe(422);
    expect((await r.json()).reason).toBe("ALREADY_APPEALED");
  });

  it("refuses an empty or over-long note (400)", async () => {
    for (const appealNote of ["", "  ", "x".repeat(1001)]) {
      const d = { limit: limit(), appeal: vi.fn() };
      expect((await appealHandler(ctx("/safety/appeals", "POST", { moderationActionId: "a1", appealNote }), d)).status).toBe(400);
      expect(d.appeal).not.toHaveBeenCalled();
    }
  });

  it("submits a trust appeal, answering 422 NOT_LIMITED and ALREADY_OPEN", async () => {
    const d = { limit: limit(), appeal: vi.fn(async () => ({ status: "submitted" as const })) };
    expect(await (await trustAppealHandler(ctx("/safety/trust-appeals", "POST", { note: "please" }), d)).json()).toEqual({ status: "submitted" });
    expect(d.appeal).toHaveBeenCalledWith({ userId: "user-a" }, "please");
    for (const code of ["NOT_LIMITED", "ALREADY_OPEN"] as const) {
      const r = await trustAppealHandler(ctx("/safety/trust-appeals", "POST", { note: "please" }), { limit: limit(), appeal: vi.fn(async () => ({ status: "error" as const, code })) });
      expect(r.status).toBe(422);
      expect((await r.json()).reason).toBe(code);
    }
  });
});
