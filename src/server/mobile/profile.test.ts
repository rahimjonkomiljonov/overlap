import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { StepResult } from "@/server/profile/service";
import { mobileError, type MobileContext } from "./guard";
import { profileBodies, PROFILE_RATE_LIMIT, stepHandler } from "./profile";

const context = (
  body: unknown,
  contentType: string | null = "application/json",
): MobileContext => ({
  actor: { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE },
  request: new Request("https://overlaps.tech/api/mobile/v1/profile/x", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: contentType ? { "content-type": contentType } : {},
  }),
});

function handlerFor(
  result: StepResult = { status: "success" },
  limited: NextResponse | null = null,
) {
  const run = vi.fn(async () => result);
  const limit = vi.fn(async () => limited);
  return { handle: stepHandler(profileBodies.intents, run, { limit }), run, limit };
}

describe("stepHandler", () => {
  it("validates, runs the shared step for this person and answers saved", async () => {
    const { handle, run } = handlerFor();
    const response = await handle(context({ intents: ["FRIENDS"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "saved" });
    expect(run).toHaveBeenCalledWith(
      { userId: "user-a", campusId: "campus-1" },
      { intents: ["FRIENDS"] },
    );
  });

  it("answers a rule the step enforces as 422 RULE_VIOLATION with its reason", async () => {
    for (const code of ["DATING_REQUIRES_CONSENT", "DATING_NOT_OPEN"] as const) {
      const response = await handlerFor({ status: "error", code }).handle(
        context({ intents: ["DATING"] }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: code });
    }
  });

  it("answers a malformed body with 400 and runs nothing", async () => {
    const { handle, run } = handlerFor();
    for (const body of [
      {},
      { intents: [] },
      { intents: ["NOT_A_MODE"] },
      { intents: ["FRIENDS"], isAdmin: true },
    ]) {
      const response = await handle(context(body));
      expect(response.status).toBe(400);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    const response = await handlerFor().handle(context({ intents: ["FRIENDS"] }, "text/plain"));
    expect(response.status).toBe(400);
  });

  it("is limited per person and says 429 before touching anything", async () => {
    const { handle, run, limit } = handlerFor(undefined, mobileError("RATE_LIMITED"));
    const response = await handle(context({ intents: ["FRIENDS"] }));
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith("profile:user-a");
    expect(run).not.toHaveBeenCalled();
    expect(PROFILE_RATE_LIMIT.max).toBeLessThanOrEqual(120);
  });
});

describe("profileBodies (the website's schemas, made strict)", () => {
  const good = {
    basics: { firstName: "Jisoo", gender: "WOMAN", year: 2, major: "경영학과", interestedIn: [] },
    intents: { intents: ["FRIENDS", "STUDY"] },
    courses: { courseIds: ["c1"] },
    clubs: { clubIds: [] },
    spots: { spotIds: ["s1"] },
    freeTime: { slots: [0, 83] },
    interests: { interestTagIds: ["t1"], freeText: ["origami"] },
    prompts: { promptIds: ["a", "b", "c"], answers: ["x", "y", "z"] },
    values: { answers: [1, 2, 3, 4, 5, 1, 2, 3] },
  } as const;

  it("accepts a normal body for every step", () => {
    for (const [name, schema] of Object.entries(profileBodies)) {
      expect(schema.safeParse(good[name as keyof typeof good]).success, name).toBe(true);
    }
  });

  it("refuses an unknown field on every step", () => {
    for (const [name, schema] of Object.entries(profileBodies)) {
      expect(schema.safeParse({ ...good[name as keyof typeof good], extra: 1 }).success, name).toBe(
        false,
      );
    }
  });

  it("keeps the website's limits: slot range, prompt count, quiz length and scale, name length, department list", () => {
    expect(profileBodies.freeTime.safeParse({ slots: [84] }).success).toBe(false);
    expect(
      profileBodies.prompts.safeParse({ promptIds: ["a", "b"], answers: ["x", "y"] }).success,
    ).toBe(false);
    expect(profileBodies.values.safeParse({ answers: [1, 2, 3] }).success).toBe(false);
    expect(profileBodies.values.safeParse({ answers: [6, 1, 1, 1, 1, 1, 1, 1] }).success).toBe(
      false,
    );
    expect(
      profileBodies.basics.safeParse({ ...good.basics, firstName: "x".repeat(51) }).success,
    ).toBe(false);
    expect(
      profileBodies.basics.safeParse({ ...good.basics, major: "Made-up Department" }).success,
    ).toBe(false);
    expect(profileBodies.basics.safeParse({ ...good.basics, gender: "OTHER" }).success).toBe(false);
  });
});
