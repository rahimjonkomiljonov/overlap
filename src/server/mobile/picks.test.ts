import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { IntentPicks, PickCardData } from "@/server/picks/queries";
import { mobileError, type MobileContext } from "./guard";
import { pickPassHandler, picksHandler } from "./picks";

const ORIGIN = "https://overlaps.tech";
const actor = {
  userId: "user-a",
  campusId: "campus-1",
  role: Role.USER,
  status: UserStatus.ACTIVE,
};
const ctx = (path: string, method = "GET"): MobileContext => ({
  actor,
  request: new Request(`${ORIGIN}/api/mobile/v1${path}`, { method }),
});

const card = (overrides: Partial<PickCardData> = {}): PickCardData => ({
  batchItemId: "item-1",
  candidateUserId: "SECRET-user-id",
  firstName: "Mina",
  gender: "WOMAN",
  year: 2,
  major: "Design",
  photos: [{ id: "ph-1", url: "/api/dev-storage/profile-photos/u/p.jpg" }],
  prompts: [
    { id: "pa-1", textKo: "완벽한 하루는", textEn: "My perfect day looks like", answer: "Coffee" },
  ],
  reasons: [
    { type: "course", label: "Typography" },
    { type: "freeTime", day: 2, block: 8 },
  ],
  secondChance: false,
  ...overrides,
});
const picks = (items: PickCardData[], intent: IntentPicks["intent"] = "FRIENDS"): IntentPicks[] => [
  { intent, items },
];

describe("picksHandler", () => {
  const deps = (list: IntentPicks[], complete = true, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    isProfileComplete: vi.fn(async () => complete),
    getPicks: vi.fn(async () => list),
  });

  it("returns each card with its own id, public profile bits, reasons and full photo addresses", async () => {
    const response = await picksHandler(ctx("/picks"), deps(picks([card()])));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      intents: [
        {
          intent: "FRIENDS",
          items: [
            {
              id: "item-1",
              firstName: "Mina",
              year: 2,
              major: "Design",
              photos: [{ id: "ph-1", url: `${ORIGIN}/api/dev-storage/profile-photos/u/p.jpg` }],
              prompts: [{ id: "pa-1", question: "My perfect day looks like", answer: "Coffee" }],
              reasons: [
                { type: "course", label: "Typography" },
                { type: "freeTime", day: 2, block: 8 },
              ],
              secondChance: false,
            },
          ],
        },
      ],
    });
  });

  it("never carries the other person's user id, gender or anything not shown on the website card", async () => {
    const response = await picksHandler(ctx("/picks"), deps(picks([card()])));
    const text = JSON.stringify(await response.json());
    for (const forbidden of [
      "SECRET-user-id",
      "candidateUserId",
      "userId",
      "gender",
      "WOMAN",
      "interestedIn",
      "email",
      "birthYear",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("asks for the language it was told to and defaults to English", async () => {
    const d = deps(picks([card()]));
    await picksHandler(ctx("/picks"), d);
    expect(d.getPicks).toHaveBeenLastCalledWith({ userId: "user-a", campusId: "campus-1" }, "en");
    const response = await picksHandler(ctx("/picks?locale=ko"), d);
    expect(d.getPicks).toHaveBeenLastCalledWith({ userId: "user-a", campusId: "campus-1" }, "ko");
    expect((await response.json()).intents[0].items[0].prompts[0].question).toBe("완벽한 하루는");
  });

  it("refuses an unknown language or an unknown parameter (400)", async () => {
    for (const query of ["?locale=fr", "?x=1"]) {
      const response = await picksHandler(ctx(`/picks${query}`), deps(picks([card()])));
      expect(response.status).toBe(400);
    }
  });

  it("lists a caught-up mode as an empty list, and nothing at all when no mode is chosen", async () => {
    const caughtUp = await picksHandler(ctx("/picks"), deps(picks([])));
    expect(await caughtUp.json()).toEqual({ intents: [{ intent: "FRIENDS", items: [] }] });
    const none = await picksHandler(ctx("/picks"), deps([]));
    expect(await none.json()).toEqual({ intents: [] });
  });

  it("keeps a second-chance flag on the card", async () => {
    const response = await picksHandler(ctx("/picks"), deps(picks([card({ secondChance: true })])));
    expect((await response.json()).intents[0].items[0].secondChance).toBe(true);
  });

  it("refuses a person whose profile is not finished, without composing a batch (422 PROFILE_INCOMPLETE)", async () => {
    const d = deps(picks([card()]), false);
    const response = await picksHandler(ctx("/picks"), d);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "RULE_VIOLATION",
      reason: "PROFILE_INCOMPLETE",
    });
    expect(d.getPicks).not.toHaveBeenCalled();
  });

  it("stops at the rate limit before doing any work, keyed on the signed-in person", async () => {
    const d = deps(picks([card()]), true, mobileError("RATE_LIMITED"));
    const response = await picksHandler(ctx("/picks"), d);
    expect(response.status).toBe(429);
    expect(d.limit).toHaveBeenCalledWith("picks:user-a");
    expect(d.isProfileComplete).not.toHaveBeenCalled();
    expect(d.getPicks).not.toHaveBeenCalled();
  });
});

describe("pickPassHandler", () => {
  type Result = { status: "passed" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };
  const deps = (result: Result, limited: NextResponse | null = null) => ({
    limit: vi.fn(async () => limited),
    pass: vi.fn(async () => result),
  });

  it("passes the pick named in the path, as the caller", async () => {
    const d = deps({ status: "passed" });
    const response = await pickPassHandler(ctx("/picks/item-1/pass", "POST"), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "passed", batchItemId: "item-1" });
    expect(d.pass).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" }, "item-1");
  });

  it("answers 404 for a pick that is not the caller's, exactly like one that does not exist", async () => {
    const d = deps({ status: "error", code: "NOT_FOUND" });
    const response = await pickPassHandler(ctx("/picks/item-9/pass", "POST"), d);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("answers 422 ALREADY_DECIDED for a pick that was already passed or waved", async () => {
    const d = deps({ status: "error", code: "ALREADY_DECIDED" });
    const response = await pickPassHandler(ctx("/picks/item-1/pass", "POST"), d);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "RULE_VIOLATION", reason: "ALREADY_DECIDED" });
  });

  it("treats an id with odd characters as not found, without asking the database", async () => {
    for (const bad of ["a%2F..%2Fb", "x;drop", "a".repeat(65), "[batchItemId]"]) {
      const d = deps({ status: "passed" });
      const response = await pickPassHandler(ctx(`/picks/${bad}/pass`, "POST"), d);
      expect(response.status, bad).toBe(404);
      expect(d.pass).not.toHaveBeenCalled();
    }
  });

  it("stops at the rate limit before touching anything", async () => {
    const d = deps({ status: "passed" }, mobileError("RATE_LIMITED"));
    const response = await pickPassHandler(ctx("/picks/item-1/pass", "POST"), d);
    expect(response.status).toBe(429);
    expect(d.limit).toHaveBeenCalledWith("pick-pass:user-a");
    expect(d.pass).not.toHaveBeenCalled();
  });
});
