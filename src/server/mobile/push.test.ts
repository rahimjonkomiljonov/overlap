import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { mobileError, type MobileContext } from "./guard";
import { pushStatusHandler, registerDeviceHandler, unregisterDeviceHandler } from "./push";

const ORIGIN = "https://overlaps.tech";
const TOKEN = "ExponentPushToken[abcdEFGH1234_-xyz]";
const actor = { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE };
const ctx = (method: string, body?: unknown): MobileContext => ({
  actor,
  request: new Request(`${ORIGIN}/api/mobile/v1/push/device`, {
    method,
    headers: body === undefined ? { cookie: "session=abc" } : { "content-type": "application/json", cookie: "session=abc" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }),
});
const limit = (limited: NextResponse | null = null) => vi.fn(async () => limited);

describe("pushStatusHandler", () => {
  it("reports enabled only when at least one phone is registered, counted for the caller alone", async () => {
    const countDevices = vi.fn(async () => 2);
    const response = await pushStatusHandler(ctx("GET"), { limit: limit(), countDevices });
    expect(await response.json()).toEqual({ enabled: true, devices: 2 });
    expect(countDevices).toHaveBeenCalledWith({ userId: "user-a" });
    const none = await pushStatusHandler(ctx("GET"), { limit: limit(), countDevices: async () => 0 });
    expect(await none.json()).toEqual({ enabled: false, devices: 0 });
  });

  it("stops at the rate limit before reading", async () => {
    const countDevices = vi.fn();
    const response = await pushStatusHandler(ctx("GET"), { limit: limit(mobileError("RATE_LIMITED")), countDevices });
    expect(response.status).toBe(429);
    expect(countDevices).not.toHaveBeenCalled();
  });
});

describe("registerDeviceHandler", () => {
  it("saves a valid Expo token for the caller", async () => {
    const register = vi.fn(async () => ({ status: "registered" as const }));
    const response = await registerDeviceHandler(ctx("PUT", { token: TOKEN }), { limit: limit(), register });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "registered" });
    expect(register).toHaveBeenCalledWith({ userId: "user-a" }, TOKEN);
  });

  it.each([
    ["a web push endpoint", { token: "https://fcm.googleapis.com/fcm/send/abc" }],
    ["a bare string", { token: "not-a-token" }],
    ["a missing token", {}],
    ["an extra field", { token: TOKEN, userId: "someone-else" }],
  ])("refuses %s with 400 and saves nothing", async (_name, body) => {
    const register = vi.fn();
    const response = await registerDeviceHandler(ctx("PUT", body), { limit: limit(), register });
    expect(response.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    const register = vi.fn();
    const response = await registerDeviceHandler(ctx("PUT", { token: TOKEN }), { limit: limit(mobileError("RATE_LIMITED")), register });
    expect(response.status).toBe(429);
    expect(register).not.toHaveBeenCalled();
  });
});

describe("unregisterDeviceHandler", () => {
  it("removes the token as the caller", async () => {
    const unregister = vi.fn(async () => ({ status: "removed" as const }));
    const response = await unregisterDeviceHandler(ctx("DELETE", { token: TOKEN }), { limit: limit(), unregister });
    expect(await response.json()).toEqual({ status: "removed" });
    expect(unregister).toHaveBeenCalledWith({ userId: "user-a" }, TOKEN);
  });

  it("refuses a malformed token", async () => {
    const unregister = vi.fn();
    const response = await unregisterDeviceHandler(ctx("DELETE", { token: "x" }), { limit: limit(), unregister });
    expect(response.status).toBe(400);
    expect(unregister).not.toHaveBeenCalled();
  });
});
