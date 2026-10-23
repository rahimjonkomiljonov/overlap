import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { WizardState } from "@/server/profile/queries";
import { mobileError, type MobileContext } from "./guard";
import {
  finishHandler,
  profileOptions,
  profileView,
  searchHandler,
  SEARCH_RATE_LIMIT,
} from "./profile-read";

const context = (url = "https://overlaps.tech/api/mobile/v1/x"): MobileContext => ({
  actor: { userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE },
  request: new Request(url),
});

const state = {
  onboardingStep: 3,
  completedAt: new Date("2026-10-24T01:02:03Z"),
  strength: 40,
  firstName: "Jisoo",
  interestedIn: ["MAN"],
  photos: [],
} as unknown as WizardState;

describe("profileView", () => {
  it("returns the person's own state with what is missing and whether Dating is open", async () => {
    const getState = vi.fn(async () => state);
    const response = await profileView(context(), {
      getState,
      getMissing: async () => ["photos"],
      getDatingStatus: async () => "needs_consent",
    });
    const body = await response.json();
    expect(body).toMatchObject({
      onboardingStep: 3,
      firstName: "Jisoo",
      missing: ["photos"],
      datingStatus: "needs_consent",
      completedAt: "2026-10-24T01:02:03.000Z",
    });
    expect(getState).toHaveBeenCalledWith("user-a"); // only ever the caller's own row
  });

  it("reports an unfinished profile with no completion date", async () => {
    const response = await profileView(context(), {
      getState: async () => ({ ...state, completedAt: null }),
      getMissing: async () => [],
      getDatingStatus: async () => "available",
    });
    expect((await response.json()).completedAt).toBeNull();
  });
});

describe("profileOptions", () => {
  it("returns the lists and every limit the screens need", async () => {
    const response = await profileOptions({
      prompts: async () => [{ id: "p1", textKo: "가", textEn: "A" }],
      interests: async () => [{ id: "t1", labelKo: "나", labelEn: "B" }],
    });
    const body = await response.json();
    expect(body.limits).toMatchObject({
      requiredPrompts: 3,
      valuesQuizLength: 8,
      minPhotos: 3,
      maxPhotos: 6,
      interests: 12,
      maxFreeTimeSlot: 83,
    });
    expect(body.genders).toEqual(["WOMAN", "MAN"]);
    expect(body.studyYears).toEqual([1, 2, 3, 4, 5]);
    expect(body.valuesQuiz).toHaveLength(8);
    expect(body.majorGroups.length).toBeGreaterThan(3);
    expect(body.prompts).toEqual([{ id: "p1", textKo: "가", textEn: "A" }]);
    expect(body.interests).toEqual([{ id: "t1", labelKo: "나", labelEn: "B" }]);
  });
});

describe("finishHandler", () => {
  it("passes the caller's own identity to the finish step and returns its answer", async () => {
    const finish = vi.fn(async () => ({ status: "incomplete" as const, missing: ["photos"] }));
    const response = await finishHandler(context(), { finish });
    expect(await response.json()).toEqual({ status: "incomplete", missing: ["photos"] });
    expect(finish).toHaveBeenCalledWith({ userId: "user-a", campusId: "campus-1" });
  });
});

describe("searchHandler", () => {
  const deps = (
    results: unknown[] = [{ id: "k1" }],
    limited = null as ReturnType<typeof mobileError> | null,
  ) => ({
    search: vi.fn(async () => results),
    limit: vi.fn(async () => limited),
  });

  it("searches the caller's own campus, whatever the query says", async () => {
    const d = deps();
    const response = await searchHandler(
      context(
        "https://overlaps.tech/api/mobile/v1/reference/search?type=club&q=hik&campusId=campus-2",
      ),
      d,
    );
    expect(await response.json()).toEqual({ results: [{ id: "k1" }] });
    expect(d.search).toHaveBeenCalledWith({
      type: "club",
      q: "hik",
      term: undefined,
      campusId: "campus-1",
    });
  });

  it("allows an empty query (suggestions before typing) and passes a course term through", async () => {
    const d = deps([]);
    await searchHandler(
      context("https://overlaps.tech/api/mobile/v1/reference/search?type=course&term=2026-2"),
      d,
    );
    expect(d.search).toHaveBeenCalledWith({
      type: "course",
      q: "",
      term: "2026-2",
      campusId: "campus-1",
    });
  });

  it("refuses an unknown type or a missing type with 400, and searches nothing", async () => {
    for (const qs of ["?type=person&q=a", "?q=a", "?type=club&q=" + "x".repeat(61)]) {
      const d = deps();
      const response = await searchHandler(
        context(`https://overlaps.tech/api/mobile/v1/reference/search${qs}`),
        d,
      );
      expect(response.status).toBe(400);
      expect(d.search).not.toHaveBeenCalled();
    }
  });

  it("is limited per person and answers 429 first", async () => {
    const d = deps([], mobileError("RATE_LIMITED"));
    const response = await searchHandler(
      context("https://overlaps.tech/api/mobile/v1/reference/search?type=club"),
      d,
    );
    expect(response.status).toBe(429);
    expect(d.limit).toHaveBeenCalledWith("search:user-a");
    expect(d.search).not.toHaveBeenCalled();
    expect(SEARCH_RATE_LIMIT.max).toBeGreaterThanOrEqual(100);
  });
});
