import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { ChatDetail } from "@/server/chat/queries";
import { mobileError, type MobileContext } from "./guard";
import { chatDetailHandler, reviveConversationHandler, sendMessageHandler } from "./chat";

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

const detail = (overrides: Partial<ChatDetail> = {}): ChatDetail => ({
  conversationId: "c1",
  matchId: "m1",
  status: "ACTIVE",
  revivedAt: null,
  matchStatus: "ACTIVE",
  otherUserId: "SECRET-user-id",
  otherFirstName: "Mina",
  otherPhotoUrl: "/api/dev-storage/profile-photos/u/p.jpg",
  canInteract: true,
  messages: [],
  icebreakers: [],
  ...overrides,
});

describe("chatDetailHandler", () => {
  const deps = (result: ChatDetail | null, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    getChatDetail: vi.fn(async () => result),
  });

  it("returns the thread with a full photo address", async () => {
    const response = await chatDetailHandler(ctx("/chat/c1"), deps(detail()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversationId: "c1",
      matchId: "m1",
      status: "ACTIVE",
      revivedAt: null,
      matchStatus: "ACTIVE",
      otherUserId: "SECRET-user-id",
      otherFirstName: "Mina",
      otherPhotoUrl: `${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg`,
      canInteract: true,
      messages: [],
      icebreakers: [],
    });
  });

  it("asks for the conversation named in the path, in the caller's own locale", async () => {
    const d = deps(detail());
    await chatDetailHandler(ctx("/chat/c1?locale=ko"), d);
    expect(d.getChatDetail).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "c1", "ko");
  });

  it("passes messages and icebreakers through as given", async () => {
    const d = deps(
      detail({
        messages: [{ id: "m1", senderId: "user-a", text: "hi", createdAt: new Date("2026-10-28T00:00:00Z") }],
        icebreakers: [{ type: "course", label: "CS201" }],
      }),
    );
    const response = await chatDetailHandler(ctx("/chat/c1"), d);
    const body = await response.json();
    expect(body.messages).toEqual([{ id: "m1", senderId: "user-a", text: "hi", createdAt: "2026-10-28T00:00:00.000Z" }]);
    expect(body.icebreakers).toEqual([{ type: "course", label: "CS201" }]);
  });

  it("answers 404 for a conversation that is not the caller's, or does not exist", async () => {
    const response = await chatDetailHandler(ctx("/chat/c1"), deps(null));
    expect(response.status).toBe(404);
  });

  it("stops at the rate limit before doing any work", async () => {
    const d = deps(detail(), mobileError("RATE_LIMITED"));
    const response = await chatDetailHandler(ctx("/chat/c1"), d);
    expect(response.status).toBe(429);
    expect(d.getChatDetail).not.toHaveBeenCalled();
  });
});

describe("sendMessageHandler", () => {
  type Result =
    | { status: "sent"; message: { id: string; senderId: string; text: string; createdAt: Date } }
    | { status: "error"; code: "NOT_FOUND" | "UNMATCHED" | "EXPIRED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    send: vi.fn(async () => result),
  });

  it("sends a message in the conversation named in the path, as the caller", async () => {
    const d = deps({ status: "sent", message: { id: "m1", senderId: "user-a", text: "hi", createdAt: new Date("2026-10-28T00:00:00Z") } });
    const response = await sendMessageHandler(ctx("/chat/c1/messages", "POST", { text: "hi" }), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "sent",
      message: { id: "m1", senderId: "user-a", text: "hi", createdAt: "2026-10-28T00:00:00.000Z" },
    });
    expect(d.send).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "c1", "hi");
  });

  it("answers 404 for a conversation that is not the caller's", async () => {
    const response = await sendMessageHandler(
      ctx("/chat/c1/messages", "POST", { text: "hi" }),
      deps({ status: "error", code: "NOT_FOUND" }),
    );
    expect(response.status).toBe(404);
  });

  it("answers 422 for UNMATCHED and EXPIRED", async () => {
    for (const code of ["UNMATCHED", "EXPIRED"] as const) {
      const response = await sendMessageHandler(ctx("/chat/c1/messages", "POST", { text: "hi" }), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("refuses an empty or over-long message (400), without asking the database", async () => {
    for (const text of ["", "  ", "a".repeat(2001)]) {
      const d = deps({ status: "sent", message: { id: "m1", senderId: "user-a", text, createdAt: new Date() } });
      const response = await sendMessageHandler(ctx("/chat/c1/messages", "POST", { text }), d);
      expect(response.status, JSON.stringify(text)).toBe(400);
      expect(d.send).not.toHaveBeenCalled();
    }
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps(
      { status: "sent", message: { id: "m1", senderId: "user-a", text: "hi", createdAt: new Date() } },
      mobileError("RATE_LIMITED"),
    );
    const response = await sendMessageHandler(ctx("/chat/c1/messages", "POST", { text: "hi" }), d);
    expect(response.status).toBe(429);
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe("reviveConversationHandler", () => {
  type Result = { status: "revived" } | { status: "error"; code: "NOT_FOUND" | "UNMATCHED" | "NOT_EXPIRED" | "ALREADY_REVIVED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    revive: vi.fn(async () => result),
  });

  it("revives the conversation named in the path, as the caller", async () => {
    const d = deps({ status: "revived" });
    const response = await reviveConversationHandler(ctx("/chat/c1/revive", "POST"), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "revived" });
    expect(d.revive).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "c1");
  });

  it("answers 404 for a conversation that is not the caller's", async () => {
    const response = await reviveConversationHandler(ctx("/chat/c1/revive", "POST"), deps({ status: "error", code: "NOT_FOUND" }));
    expect(response.status).toBe(404);
  });

  it("answers 422 for UNMATCHED, NOT_EXPIRED and ALREADY_REVIVED", async () => {
    for (const code of ["UNMATCHED", "NOT_EXPIRED", "ALREADY_REVIVED"] as const) {
      const response = await reviveConversationHandler(ctx("/chat/c1/revive", "POST"), deps({ status: "error", code }));
      expect(response.status, code).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "revived" }, mobileError("RATE_LIMITED"));
    const response = await reviveConversationHandler(ctx("/chat/c1/revive", "POST"), d);
    expect(response.status).toBe(429);
    expect(d.revive).not.toHaveBeenCalled();
  });
});
