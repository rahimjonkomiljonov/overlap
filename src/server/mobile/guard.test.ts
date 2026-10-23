import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/server/auth/authz";
import { MOBILE_ERRORS, withMobileAuth } from "./guard";

const actor = (status: UserStatus = UserStatus.ACTIVE): Actor => ({ userId: "user-a", campusId: "campus-1", role: Role.USER, status });
const request = (version: string | null = "0.1.0") => new Request("https://overlaps.tech/api/mobile/v1/x", { headers: version ? { "x-app-version": version } : {} });
const ok = () => NextResponse.json({ ok: true });

async function call(found: Actor, { version, allowRestricted, handler }: { version?: string | null; allowRestricted?: boolean; handler?: () => NextResponse | Promise<NextResponse> } = {}) {
  const getActor = vi.fn(async () => found);
  const route = withMobileAuth("test", handler ?? ok, { getActor }, { allowRestricted });
  const response = await route(request(version === undefined ? "0.1.0" : version));
  return { response, body: await response.json(), getActor };
}

describe("withMobileAuth", () => {
  it("runs the handler for a signed-in, active account and hands it the actor", async () => {
    const handler = vi.fn(async ({ actor: a }: { actor: NonNullable<Actor> }) => NextResponse.json({ who: a.userId }));
    const route = withMobileAuth("test", handler, { getActor: async () => actor() });
    const response = await route(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ who: "user-a" });
  });

  it("answers 401 UNAUTHENTICATED with no session, without running the handler", async () => {
    const handler = vi.fn(ok);
    const { response, body } = await call(null, { handler });
    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "UNAUTHENTICATED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses paused, suspended, banned and deleted accounts with 403 ACCOUNT_RESTRICTED", async () => {
    for (const status of [UserStatus.PAUSED, UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.DELETED]) {
      const { response, body } = await call(actor(status));
      expect(response.status).toBe(403);
      expect(body).toEqual({ error: "ACCOUNT_RESTRICTED" });
    }
  });

  it("with allowRestricted, lets a paused, suspended or banned person see their own situation, but not a deleted one", async () => {
    for (const status of [UserStatus.PAUSED, UserStatus.SUSPENDED, UserStatus.BANNED]) {
      expect((await call(actor(status), { allowRestricted: true })).response.status).toBe(200);
    }
    const deleted = await call(actor(UserStatus.DELETED), { allowRestricted: true });
    expect(deleted.response.status).toBe(401);
    expect((await call(null, { allowRestricted: true })).response.status).toBe(401);
  });

  it("refuses an app that is too old, or that sends no version, with 426 before looking at the session", async () => {
    for (const version of ["0.0.9", "garbage", null]) {
      const { response, body, getActor } = await call(actor(), { version });
      expect(response.status).toBe(426);
      expect(body).toEqual({ error: "UPGRADE_REQUIRED" });
      expect(getActor).not.toHaveBeenCalled();
    }
  });

  it("turns an unexpected failure into a plain 500 that leaks nothing", async () => {
    const { response, body } = await call(actor(), {
      handler: () => {
        throw new Error("connection string postgresql://user:secret@host/db failed");
      },
    });
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "INTERNAL" });
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("uses the documented status for every error code", () => {
    expect(MOBILE_ERRORS).toMatchObject({ UPGRADE_REQUIRED: 426, UNAUTHENTICATED: 401, ACCOUNT_RESTRICTED: 403, RATE_LIMITED: 429, INTERNAL: 500 });
  });
});
