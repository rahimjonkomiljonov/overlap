import type * as z from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentType, IntentMode } from "@/generated/prisma/enums";
import { decryptField } from "@/server/privacy/encryption";
import type { basicsSchema } from "./schema";
import {
  finishProfileStep,
  saveBasicsStep,
  saveClubsStep,
  saveCoursesStep,
  saveFreeTimeStep,
  saveInterestsStep,
  saveIntentsStep,
  savePromptsStep,
  saveValuesQuizStep,
  STEP_INDEX,
  type ProfileDb,
} from "./service";

const person = { userId: "user-a", campusId: "campus-1" };

type Row = Record<string, unknown>;
type Where = { id?: { in: string[] }; campusId?: string; active?: boolean };

/** An in-memory stand-in for the handful of tables the profile steps touch. */
function fakeDb(
  opts: {
    profile?: Row;
    consentGranted?: boolean;
    datingOpen?: boolean;
    courses?: Row[];
    clubs?: Row[];
    interestTags?: Row[];
    prompts?: Row[];
    promptAnswers?: number;
    photos?: number;
  } = {},
) {
  const profile: Row = {
    id: "profile-1",
    userId: "user-a",
    onboardingStep: 0,
    completedAt: null,
    firstName: null,
    gender: null,
    major: null,
    year: null,
    intents: [],
    valuesAnswers: [],
    ...opts.profile,
  };
  const calls: { name: string; args: unknown }[] = [];
  const log = (name: string) =>
    vi.fn(async (args: unknown) => {
      calls.push({ name, args });
      return {};
    });
  const pick = (rows: Row[] = []) =>
    vi.fn(async ({ where }: { where: Where }) =>
      rows.filter(
        (r) =>
          (!where.id || where.id.in.includes(r.id as string)) &&
          (where.campusId === undefined || r.campusId === where.campusId) &&
          (where.active === undefined || r.active === where.active),
      ),
    );
  const db = {
    profile: {
      upsert: vi.fn(async () => profile),
      update: vi.fn(async ({ data }: { data: Row }) => {
        calls.push({ name: "profile.update", args: data });
        Object.assign(profile, data);
        return profile;
      }),
    },
    consent: {
      findFirst: vi.fn(async ({ where }: { where: { type: ConsentType } }) =>
        where.type === ConsentType.SENSITIVE_PREFERENCE && opts.consentGranted
          ? { granted: true, withdrawnAt: null }
          : null,
      ),
    },
    user: { findUnique: vi.fn(async () => ({ cohort: { datingOpen: opts.datingOpen ?? false } })) },
    course: { findMany: pick(opts.courses) },
    club: { findMany: pick(opts.clubs) },
    interestTag: { findMany: pick(opts.interestTags) },
    prompt: { findMany: pick(opts.prompts) },
    profileCourse: {
      deleteMany: log("profileCourse.deleteMany"),
      upsert: log("profileCourse.upsert"),
    },
    profileClub: { deleteMany: log("profileClub.deleteMany"), upsert: log("profileClub.upsert") },
    profileInterestTag: {
      deleteMany: log("profileInterestTag.deleteMany"),
      upsert: log("profileInterestTag.upsert"),
    },
    promptAnswer: {
      deleteMany: log("promptAnswer.deleteMany"),
      create: log("promptAnswer.create"),
      count: vi.fn(async () => opts.promptAnswers ?? 0),
    },
    photo: { count: vi.fn(async () => opts.photos ?? 0) },
    $transaction: vi.fn(async (steps: Promise<unknown>[]) => Promise.all(steps)),
  } as unknown as ProfileDb;
  return { db, profile, calls };
}

const basics: z.infer<typeof basicsSchema> = {
  firstName: "Jisoo",
  gender: "WOMAN",
  pronouns: undefined,
  year: 2,
  major: "컴퓨터공학과 (영어 트랙)",
  interestedIn: ["MAN"],
};

beforeEach(() => vi.stubEnv("FIELD_ENCRYPTION_KEY_V1", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("saveBasicsStep", () => {
  it("never stores who someone would like to meet without the sensitive consent, whatever the client sent", async () => {
    const f = fakeDb({ consentGranted: false });
    await saveBasicsStep(f.db, person, { ...basics, interestedIn: ["MAN"] });
    expect(f.profile.interestedIn).toBeNull();
    expect(f.profile.firstName).toBe("Jisoo");
  });

  it("stores it encrypted (never as plain text) when the consent was granted, and it reads back", async () => {
    const f = fakeDb({ consentGranted: true });
    await saveBasicsStep(f.db, person, { ...basics, interestedIn: ["MAN", "WOMAN"] });
    const stored = f.profile.interestedIn as string;
    expect(stored).not.toContain("MAN");
    expect(JSON.parse(decryptField(stored))).toEqual(["MAN", "WOMAN"]);
  });

  it("stores nothing for an empty choice even with consent", async () => {
    const f = fakeDb({ consentGranted: true });
    await saveBasicsStep(f.db, person, { ...basics, interestedIn: [] });
    expect(f.profile.interestedIn).toBeNull();
  });

  it("remembers how far the person got, but never moves a resumed profile backward", async () => {
    const fresh = fakeDb();
    await saveBasicsStep(fresh.db, person, basics);
    expect(fresh.profile.onboardingStep).toBe(STEP_INDEX.basics + 1);

    const resumed = fakeDb({ profile: { onboardingStep: 7 } });
    await saveBasicsStep(resumed.db, person, basics);
    expect(resumed.profile.onboardingStep).toBe(7);
  });
});

describe("saveIntentsStep", () => {
  it("lets Friends and Study through without any consent", async () => {
    const f = fakeDb();
    expect(
      await saveIntentsStep(f.db, person, { intents: [IntentMode.FRIENDS, IntentMode.STUDY] }),
    ).toEqual({ status: "success" });
    expect(f.profile.intents).toEqual([IntentMode.FRIENDS, IntentMode.STUDY]);
  });

  it("refuses Dating without the consent, and saves nothing", async () => {
    const f = fakeDb({ consentGranted: false });
    expect(
      await saveIntentsStep(f.db, person, { intents: [IntentMode.FRIENDS, IntentMode.DATING] }),
    ).toEqual({ status: "error", code: "DATING_REQUIRES_CONSENT" });
    expect(f.profile.intents).toEqual([]);
  });

  it("allows Dating with consent, and refuses it while the cohort is closed", async () => {
    const open = fakeDb({ consentGranted: true });
    expect((await saveIntentsStep(open.db, person, { intents: [IntentMode.DATING] })).status).toBe(
      "success",
    );

    vi.stubEnv("COHORT_RELEASE", "on");
    const closed = fakeDb({ consentGranted: true, datingOpen: false });
    expect(await saveIntentsStep(closed.db, person, { intents: [IntentMode.DATING] })).toEqual({
      status: "error",
      code: "DATING_NOT_OPEN",
    });
    const cohortOpen = fakeDb({ consentGranted: true, datingOpen: true });
    expect(
      (await saveIntentsStep(cohortOpen.db, person, { intents: [IntentMode.DATING] })).status,
    ).toBe("success");
  });
});

describe("campus-scoped picks (courses, clubs)", () => {
  it("keeps only courses on the person's own campus, and removes the rest of their old picks", async () => {
    const f = fakeDb({
      courses: [
        { id: "c1", campusId: "campus-1" },
        { id: "c2", campusId: "campus-1" },
        { id: "other", campusId: "campus-2" },
      ],
    });
    await saveCoursesStep(f.db, person, { courseIds: ["c1", "other", "c2", "c1", "forged"] });
    const upserts = f.calls
      .filter((c) => c.name === "profileCourse.upsert")
      .map((c) => (c.args as { create: { courseId: string } }).create.courseId);
    expect(upserts.sort()).toEqual(["c1", "c2"]);
    const removal = f.calls.find((c) => c.name === "profileCourse.deleteMany")!.args as {
      where: { courseId: { notIn: string[] } };
    };
    expect(removal.where.courseId.notIn.sort()).toEqual(["c1", "c2"]);
  });

  it("saving an empty list clears the picks", async () => {
    const f = fakeDb({ clubs: [{ id: "k1", campusId: "campus-1" }] });
    await saveClubsStep(f.db, person, { clubIds: [] });
    expect(f.calls.filter((c) => c.name === "profileClub.upsert")).toHaveLength(0);
    expect(
      (
        f.calls.find((c) => c.name === "profileClub.deleteMany")!.args as {
          where: { clubId: { notIn: string[] } };
        }
      ).where.clubId.notIn,
    ).toEqual([]);
  });
});

describe("saveFreeTimeStep", () => {
  it("stores each slot once, in order", async () => {
    const f = fakeDb();
    await saveFreeTimeStep(f.db, person, { slots: [30, 2, 30, 14] });
    expect(f.profile.freeTimeSlots).toEqual([2, 14, 30]);
  });
});

describe("saveInterestsStep", () => {
  const tags = [
    { id: "t1", active: true },
    { id: "t2", active: true },
    { id: "gone", active: false },
  ];

  it("keeps only active tags and saves the free text", async () => {
    const f = fakeDb({ interestTags: tags });
    expect(
      await saveInterestsStep(f.db, person, {
        interestTagIds: ["t1", "gone", "t2"],
        freeText: ["origami"],
      }),
    ).toEqual({ status: "success" });
    const kept = f.calls
      .filter((c) => c.name === "profileInterestTag.upsert")
      .map((c) => (c.args as { create: { interestTagId: string } }).create.interestTagId);
    expect(kept.sort()).toEqual(["t1", "t2"]);
    expect(f.profile.interestsFreeText).toEqual(["origami"]);
  });

  it("refuses more than twelve interests in total", async () => {
    const f = fakeDb({ interestTags: tags });
    const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(
      await saveInterestsStep(f.db, person, { interestTagIds: ids, freeText: ["a", "b", "c"] }),
    ).toEqual({ status: "error", code: "TOO_MANY_INTERESTS" });
    expect(f.calls).toHaveLength(0);
  });

  it("refuses free text about religion, politics, health or sex life, and saves nothing", async () => {
    const f = fakeDb({ interestTags: tags });
    const result = await saveInterestsStep(f.db, person, {
      interestTagIds: ["t1"],
      freeText: ["church"],
    });
    expect(result).toEqual({ status: "error", code: "SENSITIVE_CONTENT" });
    expect(f.calls).toHaveLength(0);
  });
});

describe("savePromptsStep", () => {
  const prompts = ["p1", "p2", "p3", "p4"].map((id) => ({ id, active: true }));

  it("replaces the three answers in order", async () => {
    const f = fakeDb({ prompts });
    await savePromptsStep(f.db, person, {
      promptIds: ["p3", "p1", "p2"],
      answers: ["a", "b", "c"],
    });
    const created = f.calls
      .filter((c) => c.name === "promptAnswer.create")
      .map(
        (c) => (c.args as { data: { promptId: string; answer: string; sortOrder: number } }).data,
      );
    expect(created).toEqual([
      { profileId: "profile-1", promptId: "p3", answer: "a", sortOrder: 0 },
      { profileId: "profile-1", promptId: "p1", answer: "b", sortOrder: 1 },
      { profileId: "profile-1", promptId: "p2", answer: "c", sortOrder: 2 },
    ]);
  });

  it("refuses the same prompt twice, and a prompt that does not exist or is retired", async () => {
    const dup = fakeDb({ prompts });
    expect(
      await savePromptsStep(dup.db, person, {
        promptIds: ["p1", "p1", "p2"],
        answers: ["a", "b", "c"],
      }),
    ).toEqual({ status: "error", code: "DUPLICATE_PROMPT" });
    const missing = fakeDb({ prompts: [...prompts.slice(0, 2), { id: "p3", active: false }] });
    expect(
      await savePromptsStep(missing.db, person, {
        promptIds: ["p1", "p2", "p3"],
        answers: ["a", "b", "c"],
      }),
    ).toEqual({ status: "error", code: "INVALID_PROMPT" });
    expect(missing.calls.filter((c) => c.name === "promptAnswer.create")).toHaveLength(0);
  });
});

describe("saveValuesQuizStep", () => {
  it("stores the eight answers", async () => {
    const f = fakeDb();
    await saveValuesQuizStep(f.db, person, { answers: [1, 2, 3, 4, 5, 1, 2, 3] });
    expect(f.profile.valuesAnswers).toEqual([1, 2, 3, 4, 5, 1, 2, 3]);
  });
});

describe("finishProfileStep", () => {
  const complete = {
    firstName: "Jisoo",
    gender: "WOMAN",
    major: "경영학과",
    year: 2,
    intents: [IntentMode.FRIENDS],
    valuesAnswers: [1, 2, 3, 4, 5, 1, 2, 3],
  };

  it("says what is missing and does not finish an incomplete profile", async () => {
    const f = fakeDb({ profile: complete, promptAnswers: 3, photos: 2 });
    const result = await finishProfileStep(f.db, person, async () => ["photos"]);
    expect(result).toEqual({ status: "incomplete", missing: ["photos"] });
    expect(f.profile.completedAt).toBeNull();
  });

  it("finishes once everything required is there, and keeps the first completion date", async () => {
    const f = fakeDb({ profile: complete, promptAnswers: 3, photos: 3 });
    expect(await finishProfileStep(f.db, person, async () => [])).toEqual({ status: "complete" });
    const firstDate = f.profile.completedAt as Date;
    expect(firstDate).toBeInstanceOf(Date);
    expect(f.profile.onboardingStep).toBe(STEP_INDEX.preview);
    await finishProfileStep(f.db, person, async () => []);
    expect(f.profile.completedAt).toBe(firstDate);
  });
});
