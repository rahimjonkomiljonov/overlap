import type { PrismaClient } from "@/generated/prisma/client";
import { IntentMode } from "@/generated/prisma/enums";
import { getDatingStatus } from "@/server/cohorts/release";
import { canUseDatingMode } from "@/server/consent/consent";
import { encryptField } from "@/server/privacy/encryption";
import { containsSensitiveContent } from "@/server/reference/sensitive";
import type * as z from "zod";
import {
  MAX_INTERESTS,
  REQUIRED_PROMPT_COUNT,
  type basicsSchema,
  type clubsSchema,
  type coursesSchema,
  type freeTimeSchema,
  type interestsSchema,
  type intentsSchema,
  type promptsSchema,
  type spotsSchema,
  type valuesQuizSchema,
} from "./schema";
import { isProfileComplete } from "./strength";

/**
 * What each profile-wizard step does once its input has been validated. The website's server
 * actions (FormData in) and the mobile API (JSON in) both call these, so the rules cannot differ:
 * the sensitive "who I'd like to meet" field is only stored with consent, picks are re-checked
 * against the person's own campus, Dating needs consent and an open cohort, and so on.
 *
 * Callers do the authentication and the input validation. Every function takes the database as a
 * parameter, so tests can use a fake.
 */
export type ProfileDb = PrismaClient;

export type StepResult = { status: "success" } | { status: "error"; code: StepErrorCode };
export type StepErrorCode =
  | "DATING_REQUIRES_CONSENT"
  | "DATING_NOT_OPEN"
  | "TOO_MANY_INTERESTS"
  | "SENSITIVE_CONTENT"
  | "DUPLICATE_PROMPT"
  | "INVALID_PROMPT";

/** Furthest step reached (0-indexed), so the wizard can resume here (B1). */
export const STEP_INDEX = {
  basics: 0,
  intents: 1,
  courses: 2,
  clubs: 3,
  spots: 4,
  freeTime: 5,
  interests: 6,
  prompts: 7,
  valuesQuiz: 8,
  photos: 9,
  preview: 10,
} as const;

/** Creates an empty Profile row on first use, so every step is a plain update against a row that exists. */
export function ensureProfileWith(db: ProfileDb, userId: string) {
  return db.profile.upsert({ where: { userId }, update: {}, create: { userId } });
}

/** Records how far the person has got. Never moves a resumed step backward. */
export async function bumpStep(db: ProfileDb, profileId: string, current: number, step: number) {
  if (current > step) return;
  await db.profile.update({ where: { id: profileId }, data: { onboardingStep: step + 1 } });
}

type Person = { userId: string; campusId: string };
const success: StepResult = { status: "success" };

export async function saveBasicsStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof basicsSchema>,
): Promise<StepResult> {
  const profile = await ensureProfileWith(db, person.userId);
  // "Who I'd like to meet" is only ever persisted when the sensitive consent was granted (B2).
  // Never trust the client for this, even if it sent values.
  const sensitiveGranted = await canUseDatingMode(db, person.userId);
  await db.profile.update({
    where: { id: profile.id },
    data: {
      firstName: data.firstName,
      gender: data.gender,
      pronouns: data.pronouns ?? null,
      year: data.year,
      major: data.major,
      interestedIn:
        sensitiveGranted && data.interestedIn.length > 0
          ? encryptField(JSON.stringify(data.interestedIn))
          : null,
    },
  });
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.basics);
  return success;
}

export async function saveIntentsStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof intentsSchema>,
): Promise<StepResult> {
  if (data.intents.includes(IntentMode.DATING)) {
    const datingStatus = await getDatingStatus(db, person.userId);
    if (datingStatus === "needs_consent")
      return { status: "error", code: "DATING_REQUIRES_CONSENT" };
    if (datingStatus === "cohort_closed") return { status: "error", code: "DATING_NOT_OPEN" };
  }
  const profile = await ensureProfileWith(db, person.userId);
  await db.profile.update({ where: { id: profile.id }, data: { intents: data.intents } });
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.intents);
  return success;
}

export async function saveCoursesStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof coursesSchema>,
): Promise<StepResult> {
  const profile = await ensureProfileWith(db, person.userId);
  // Re-validated against the person's own campus: the ids come from a search, but a submitted id
  // could be forged to point at another campus's row.
  const valid = await db.course.findMany({
    where: { id: { in: data.courseIds }, campusId: person.campusId },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((c) => c.id))];
  await db.$transaction([
    db.profileCourse.deleteMany({
      where: { profileId: profile.id, courseId: { notIn: validIds } },
    }),
    ...validIds.map((courseId) =>
      db.profileCourse.upsert({
        where: { profileId_courseId: { profileId: profile.id, courseId } },
        update: {},
        create: { profileId: profile.id, courseId },
      }),
    ),
  ]);
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.courses);
  return success;
}

export async function saveClubsStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof clubsSchema>,
): Promise<StepResult> {
  const profile = await ensureProfileWith(db, person.userId);
  const valid = await db.club.findMany({
    where: { id: { in: data.clubIds }, campusId: person.campusId },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((c) => c.id))];
  await db.$transaction([
    db.profileClub.deleteMany({ where: { profileId: profile.id, clubId: { notIn: validIds } } }),
    ...validIds.map((clubId) =>
      db.profileClub.upsert({
        where: { profileId_clubId: { profileId: profile.id, clubId } },
        update: {},
        create: { profileId: profile.id, clubId },
      }),
    ),
  ]);
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.clubs);
  return success;
}

export async function saveSpotsStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof spotsSchema>,
): Promise<StepResult> {
  const profile = await ensureProfileWith(db, person.userId);
  const valid = await db.spot.findMany({
    where: { id: { in: data.spotIds }, campusId: person.campusId },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((s) => s.id))];
  await db.$transaction([
    db.profileSpot.deleteMany({ where: { profileId: profile.id, spotId: { notIn: validIds } } }),
    ...validIds.map((spotId) =>
      db.profileSpot.upsert({
        where: { profileId_spotId: { profileId: profile.id, spotId } },
        update: {},
        create: { profileId: profile.id, spotId },
      }),
    ),
  ]);
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.spots);
  return success;
}

export async function saveFreeTimeStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof freeTimeSchema>,
): Promise<StepResult> {
  const profile = await ensureProfileWith(db, person.userId);
  await db.profile.update({
    where: { id: profile.id },
    data: { freeTimeSlots: [...new Set(data.slots)].sort((a, b) => a - b) },
  });
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.freeTime);
  return success;
}

export async function saveInterestsStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof interestsSchema>,
): Promise<StepResult> {
  if (data.interestTagIds.length + data.freeText.length > MAX_INTERESTS)
    return { status: "error", code: "TOO_MANY_INTERESTS" };
  // The same word guard the imports use (B8: taxonomy and free text both exclude religion, politics,
  // health and sex life). Free text is never scored, but it is displayed, so it still needs checking.
  if (data.freeText.some((t) => containsSensitiveContent(t)))
    return { status: "error", code: "SENSITIVE_CONTENT" };

  const profile = await ensureProfileWith(db, person.userId);
  const valid = await db.interestTag.findMany({
    where: { id: { in: data.interestTagIds }, active: true },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((t) => t.id))];
  await db.$transaction([
    db.profileInterestTag.deleteMany({
      where: { profileId: profile.id, interestTagId: { notIn: validIds } },
    }),
    ...validIds.map((interestTagId) =>
      db.profileInterestTag.upsert({
        where: { profileId_interestTagId: { profileId: profile.id, interestTagId } },
        update: {},
        create: { profileId: profile.id, interestTagId },
      }),
    ),
    db.profile.update({ where: { id: profile.id }, data: { interestsFreeText: data.freeText } }),
  ]);
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.interests);
  return success;
}

export async function savePromptsStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof promptsSchema>,
): Promise<StepResult> {
  if (new Set(data.promptIds).size !== REQUIRED_PROMPT_COUNT)
    return { status: "error", code: "DUPLICATE_PROMPT" };
  const validPrompts = await db.prompt.findMany({
    where: { id: { in: data.promptIds }, active: true },
    select: { id: true },
  });
  if (validPrompts.length !== REQUIRED_PROMPT_COUNT)
    return { status: "error", code: "INVALID_PROMPT" };

  const profile = await ensureProfileWith(db, person.userId);
  await db.$transaction([
    db.promptAnswer.deleteMany({ where: { profileId: profile.id } }),
    ...data.promptIds.map((promptId, i) =>
      db.promptAnswer.create({
        data: { profileId: profile.id, promptId, answer: data.answers[i], sortOrder: i },
      }),
    ),
  ]);
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.prompts);
  return success;
}

export async function saveValuesQuizStep(
  db: ProfileDb,
  person: Person,
  data: z.infer<typeof valuesQuizSchema>,
): Promise<StepResult> {
  const profile = await ensureProfileWith(db, person.userId);
  await db.profile.update({ where: { id: profile.id }, data: { valuesAnswers: data.answers } });
  await bumpStep(db, profile.id, profile.onboardingStep, STEP_INDEX.valuesQuiz);
  return success;
}

export type FinishResult = { status: "complete" } | { status: "incomplete"; missing: string[] };

/** Marks the profile finished once every required piece is there. `missing` names what is not. */
export async function finishProfileStep(
  db: ProfileDb,
  person: Person,
  missingFor: (userId: string) => Promise<string[]>,
): Promise<FinishResult> {
  const profile = await ensureProfileWith(db, person.userId);
  const [promptCount, photoCount] = await Promise.all([
    db.promptAnswer.count({ where: { profileId: profile.id } }),
    db.photo.count({ where: { profileId: profile.id } }),
  ]);
  const complete = isProfileComplete({
    hasBasics: Boolean(profile.firstName && profile.gender && profile.major && profile.year),
    intentCount: profile.intents.length,
    valuesAnswerCount: profile.valuesAnswers.length,
    promptCount,
    photoCount,
  });
  if (!complete) return { status: "incomplete", missing: await missingFor(person.userId) };
  await db.profile.update({
    where: { id: profile.id },
    data: { completedAt: profile.completedAt ?? new Date(), onboardingStep: STEP_INDEX.preview },
  });
  return { status: "complete" };
}
