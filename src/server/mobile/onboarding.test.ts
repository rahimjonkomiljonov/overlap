import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { AccountSetupResult } from "@/server/auth/account-setup";
import { mobileError, type MobileContext } from "./guard";
import {
  accountSetupBody,
  accountSetupHandler,
  onboardingInfo,
  ONBOARDING_RATE_LIMIT,
  type AccountSetupDeps,
} from "./onboarding";

const valid = {
  birthYear: 2000,
  birthMonth: 5,
  birthDay: 17,
  attestedAdult: true,
  termsAccepted: true,
  sensitivePreference: false,
};
const context = (body: unknown, campusId = ""): MobileContext => ({
  actor: { userId: "user-a", campusId, role: Role.USER, status: UserStatus.ACTIVE },
  request: new Request("https://overlaps.tech/api/mobile/v1/onboarding/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
});
const deps = (
  result: AccountSetupResult = { status: "complete", datingAvailable: false },
  limited: NextResponse | null = null,
) => {
  const complete = vi.fn(async () => result);
  const limit = vi.fn(async () => limited);
  return { deps: { complete, limit } as AccountSetupDeps, complete, limit };
};

describe("accountSetupBody", () => {
  it("accepts a normal request, with or without an invite code, and either answer to the sensitive consent", () => {
    expect(accountSetupBody.safeParse(valid).success).toBe(true);
    expect(
      accountSetupBody.safeParse({ ...valid, inviteCode: " ABCD1234 ", sensitivePreference: true })
        .data?.inviteCode,
    ).toBe("ABCD1234");
  });

  it("requires the age statement and the Terms to be an explicit true", () => {
    for (const patch of [
      { attestedAdult: false },
      { termsAccepted: false },
      { attestedAdult: "on" },
      { termsAccepted: undefined },
    ]) {
      expect(accountSetupBody.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });

  it("requires a yes/no for the sensitive consent, so it can never be ticked for the person", () => {
    const { sensitivePreference, ...rest } = valid;
    void sensitivePreference;
    expect(accountSetupBody.safeParse(rest).success).toBe(false);
    expect(accountSetupBody.safeParse({ ...valid, sensitivePreference: "yes" }).success).toBe(
      false,
    );
  });

  it("refuses impossible dates, text for numbers, and unknown fields (strict)", () => {
    for (const patch of [
      { birthMonth: 13 },
      { birthMonth: 0 },
      { birthDay: 32 },
      { birthYear: 1800 },
      { birthYear: "2000" },
      { role: "ADMIN" },
      { inviteCode: "x".repeat(33) },
    ]) {
      expect(accountSetupBody.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});

describe("accountSetupHandler", () => {
  it("finishes setup and reports whether Dating is available", async () => {
    const { deps: d, complete } = deps({ status: "complete", datingAvailable: true });
    const response = await accountSetupHandler(context({ ...valid, sensitivePreference: true }), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete", datingAvailable: true });
    expect(complete).toHaveBeenCalledWith({
      userId: "user-a",
      birthYear: 2000,
      birthMonth: 5,
      birthDay: 17,
      attestedAdult: true,
      sensitiveGranted: true,
      inviteCode: undefined,
      source: "mobile-onboarding",
    });
  });

  it("declining the sensitive consent still completes setup (Dating off)", async () => {
    const { deps: d, complete } = deps({ status: "complete", datingAvailable: false });
    const response = await accountSetupHandler(
      context({ ...valid, sensitivePreference: false }),
      d,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete", datingAvailable: false });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ sensitiveGranted: false }));
  });

  it("answers a broken rule with 422 RULE_VIOLATION and a stable reason", async () => {
    for (const code of [
      "TOO_YOUNG",
      "INVALID_DATE",
      "IMPLAUSIBLE_YEAR",
      "INVALID_INVITE",
      "INVALID_DOMAIN",
    ] as const) {
      const response = await accountSetupHandler(
        context(valid),
        deps({ status: "error", code }).deps,
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("answers a malformed request with 400 and does not run the setup", async () => {
    const { deps: d, complete } = deps();
    const response = await accountSetupHandler(context({ ...valid, birthMonth: 99 }), d);
    expect(response.status).toBe(400);
    expect((await response.json()).fields[0].name).toBe("birthMonth");
    expect(complete).not.toHaveBeenCalled();
  });

  it("never echoes the birth date back, even in an error", async () => {
    const response = await accountSetupHandler(
      context({ ...valid, birthMonth: 99, birthYear: 2011 }),
      deps().deps,
    );
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("2011");
    expect(text).not.toContain("99");
  });

  it("is limited per person, and says so with 429 before doing anything else", async () => {
    const { deps: d, complete, limit } = deps(undefined, mobileError("RATE_LIMITED"));
    const response = await accountSetupHandler(context(valid), d);
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith("onboarding:user-a");
    expect(complete).not.toHaveBeenCalled();
    expect(ONBOARDING_RATE_LIMIT.max).toBeLessThanOrEqual(10);
  });

  it("calling it again after setup is finished changes nothing", async () => {
    const { deps: d, complete } = deps();
    const response = await accountSetupHandler(context(valid, "campus-1"), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete", alreadyComplete: true });
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("onboardingInfo", () => {
  it("tells the app whether setup is done, whether an invite code is needed and the minimum age", async () => {
    expect(await onboardingInfo(context(null, ""), false).json()).toEqual({
      accountSetupComplete: false,
      inviteCodeRequired: false,
      minimumAge: 19,
    });
    expect(await onboardingInfo(context(null, "campus-1"), true).json()).toEqual({
      accountSetupComplete: true,
      inviteCodeRequired: true,
      minimumAge: 19,
    });
  });
});
