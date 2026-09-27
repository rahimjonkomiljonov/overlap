"use server";

import { IntentMode } from "@/generated/prisma/enums";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { canUseDatingMode } from "@/server/consent/consent";
import { prisma } from "@/server/db";
import { encryptField } from "@/server/privacy/encryption";
import { containsSensitiveContent } from "@/server/reference/sensitive";
import {
  deletePhoto,
  newPhotoStorageKey,
  processPhoto,
  resolvePhotoUrl,
  uploadPhoto,
} from "@/server/storage/photos";
import { ensureProfile, getMissingRequiredSteps } from "./queries";
import {
  MAX_INTERESTS,
  MAX_PHOTOS,
  REQUIRED_PROMPT_COUNT,
  VALUES_QUIZ_LENGTH,
  basicsSchema,
  clubsSchema,
  coursesSchema,
  freeTimeSchema,
  interestsSchema,
  intentsSchema,
  promptsSchema,
  spotsSchema,
  valuesQuizSchema,
} from "./schema";
import { isProfileComplete } from "./strength";

/**
 * One server action per wizard step (S07). Every action re-derives its own
 * authorization from `getActor()` (CLAUDE.md: every server action checks
 * authorization itself) and returns a typed state rather than throwing, matching
 * src/server/auth/actions.ts's existing convention for useActionState-driven forms.
 */

export type StepState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** S20 hardening: uploads (sharp resize + a storage write) cost real server resources, unlike most other actions here. */
const ADD_PHOTO_RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };

/** Furthest step reached (0-indexed), so /onboarding/profile can resume here (B1). */
const STEP_INDEX = {
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

async function bumpStep(profileId: string, current: number, step: number) {
  if (current > step) return; // never move a resumed step backward
  await prisma.profile.update({ where: { id: profileId }, data: { onboardingStep: step + 1 } });
}

export async function saveBasics(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = basicsSchema.safeParse({
    firstName: formData.get("firstName"),
    gender: formData.get("gender"),
    pronouns: formData.get("pronouns"),
    year: formData.get("year"),
    major: formData.get("major"),
    interestedIn: formData.getAll("interestedIn"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  // "Who I'd like to meet" is only ever persisted when the sensitive consent (S05) was
  // granted (B2) — never trust the client for this, even if it posted values.
  const sensitiveGranted = await canUseDatingMode(prisma, actor.userId);

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      firstName: parsed.data.firstName,
      gender: parsed.data.gender,
      pronouns: parsed.data.pronouns ?? null,
      year: parsed.data.year,
      major: parsed.data.major,
      interestedIn:
        sensitiveGranted && parsed.data.interestedIn.length > 0
          ? encryptField(JSON.stringify(parsed.data.interestedIn))
          : null,
    },
  });
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.basics);

  return { status: "success" };
}

export async function saveIntents(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = intentsSchema.safeParse({ intents: formData.getAll("intents") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  if (parsed.data.intents.includes(IntentMode.DATING) && !(await canUseDatingMode(prisma, actor.userId))) {
    return { status: "error", code: "DATING_REQUIRES_CONSENT" };
  }

  const profile = await ensureProfile(actor.userId);
  await prisma.profile.update({ where: { id: profile.id }, data: { intents: parsed.data.intents } });
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.intents);

  return { status: "success" };
}

export async function saveCourses(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = coursesSchema.safeParse({ courseIds: formData.getAll("courseId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  // Re-validated against the actor's own campus — the IDs come from an autocomplete
  // response, but a submitted ID could be forged to point at another campus's row.
  const valid = await prisma.course.findMany({
    where: { id: { in: parsed.data.courseIds }, campusId: actor.campusId },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((c) => c.id))];

  await prisma.$transaction([
    prisma.profileCourse.deleteMany({ where: { profileId: profile.id, courseId: { notIn: validIds } } }),
    ...validIds.map((courseId) =>
      prisma.profileCourse.upsert({
        where: { profileId_courseId: { profileId: profile.id, courseId } },
        update: {},
        create: { profileId: profile.id, courseId },
      }),
    ),
  ]);
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.courses);

  return { status: "success" };
}

export async function saveClubs(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = clubsSchema.safeParse({ clubIds: formData.getAll("clubId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  const valid = await prisma.club.findMany({
    where: { id: { in: parsed.data.clubIds }, campusId: actor.campusId },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((c) => c.id))];

  await prisma.$transaction([
    prisma.profileClub.deleteMany({ where: { profileId: profile.id, clubId: { notIn: validIds } } }),
    ...validIds.map((clubId) =>
      prisma.profileClub.upsert({
        where: { profileId_clubId: { profileId: profile.id, clubId } },
        update: {},
        create: { profileId: profile.id, clubId },
      }),
    ),
  ]);
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.clubs);

  return { status: "success" };
}

export async function saveSpots(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = spotsSchema.safeParse({ spotIds: formData.getAll("spotId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  const valid = await prisma.spot.findMany({
    where: { id: { in: parsed.data.spotIds }, campusId: actor.campusId },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((s) => s.id))];

  await prisma.$transaction([
    prisma.profileSpot.deleteMany({ where: { profileId: profile.id, spotId: { notIn: validIds } } }),
    ...validIds.map((spotId) =>
      prisma.profileSpot.upsert({
        where: { profileId_spotId: { profileId: profile.id, spotId } },
        update: {},
        create: { profileId: profile.id, spotId },
      }),
    ),
  ]);
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.spots);

  return { status: "success" };
}

export async function saveFreeTime(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = freeTimeSchema.safeParse({ slots: formData.getAll("slot") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  await prisma.profile.update({
    where: { id: profile.id },
    data: { freeTimeSlots: [...new Set(parsed.data.slots)].sort((a, b) => a - b) },
  });
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.freeTime);

  return { status: "success" };
}

export async function saveInterests(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = interestsSchema.safeParse({
    interestTagIds: formData.getAll("interestTagId"),
    freeText: formData.getAll("freeText"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  if (parsed.data.interestTagIds.length + parsed.data.freeText.length > MAX_INTERESTS) {
    return { status: "error", code: "TOO_MANY_INTERESTS" };
  }
  // Same word guard S06 applies to imported clubs/tags (B8: taxonomy and free text both
  // exclude religion/politics/health/sex-life) — free text is never scored, but it's
  // still displayed on the profile, so it still needs moderation.
  if (parsed.data.freeText.some((t) => containsSensitiveContent(t))) {
    return { status: "error", code: "SENSITIVE_CONTENT" };
  }

  const profile = await ensureProfile(actor.userId);
  const valid = await prisma.interestTag.findMany({
    where: { id: { in: parsed.data.interestTagIds }, active: true },
    select: { id: true },
  });
  const validIds = [...new Set(valid.map((t) => t.id))];

  await prisma.$transaction([
    prisma.profileInterestTag.deleteMany({
      where: { profileId: profile.id, interestTagId: { notIn: validIds } },
    }),
    ...validIds.map((interestTagId) =>
      prisma.profileInterestTag.upsert({
        where: { profileId_interestTagId: { profileId: profile.id, interestTagId } },
        update: {},
        create: { profileId: profile.id, interestTagId },
      }),
    ),
    prisma.profile.update({
      where: { id: profile.id },
      data: { interestsFreeText: parsed.data.freeText },
    }),
  ]);
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.interests);

  return { status: "success" };
}

export async function savePrompts(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = promptsSchema.safeParse({
    promptIds: formData.getAll("promptId"),
    answers: formData.getAll("answer"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  if (new Set(parsed.data.promptIds).size !== REQUIRED_PROMPT_COUNT) {
    return { status: "error", code: "DUPLICATE_PROMPT" };
  }

  const validPrompts = await prisma.prompt.findMany({
    where: { id: { in: parsed.data.promptIds }, active: true },
    select: { id: true },
  });
  if (validPrompts.length !== REQUIRED_PROMPT_COUNT) {
    return { status: "error", code: "INVALID_PROMPT" };
  }

  const profile = await ensureProfile(actor.userId);
  await prisma.$transaction([
    prisma.promptAnswer.deleteMany({ where: { profileId: profile.id } }),
    ...parsed.data.promptIds.map((promptId, i) =>
      prisma.promptAnswer.create({
        data: { profileId: profile.id, promptId, answer: parsed.data.answers[i], sortOrder: i },
      }),
    ),
  ]);
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.prompts);

  return { status: "success" };
}

export async function saveValuesQuiz(_prev: StepState, formData: FormData): Promise<StepState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const answers = Array.from({ length: VALUES_QUIZ_LENGTH }, (_, i) => formData.get(`value_${i}`));
  const parsed = valuesQuizSchema.safeParse({ answers });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  await prisma.profile.update({ where: { id: profile.id }, data: { valuesAnswers: parsed.data.answers } });
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.valuesQuiz);

  return { status: "success" };
}

export type AddPhotoState =
  | { status: "idle" }
  | { status: "success"; photo: { id: string; url: string } }
  | { status: "error"; code: string };

export async function addPhoto(_prev: AddPhotoState, formData: FormData): Promise<AddPhotoState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const rate = await checkRateLimit(prisma, `add-photo:${actor.userId}`, ADD_PHOTO_RATE_LIMIT);
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", code: "INVALID_INPUT" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { status: "error", code: "FILE_TOO_LARGE" };
  }
  if (!file.type.startsWith("image/")) {
    return { status: "error", code: "INVALID_FILE_TYPE" };
  }

  const profile = await ensureProfile(actor.userId);
  const [existingCount, maxOrder] = await Promise.all([
    prisma.photo.count({ where: { profileId: profile.id } }),
    prisma.photo.aggregate({ where: { profileId: profile.id }, _max: { sortOrder: true } }),
  ]);
  if (existingCount >= MAX_PHOTOS) {
    return { status: "error", code: "TOO_MANY_PHOTOS" };
  }

  let processed;
  try {
    processed = await processPhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { status: "error", code: "INVALID_FILE_TYPE" };
  }

  const storageKey = newPhotoStorageKey(actor.userId);
  await uploadPhoto(storageKey, processed.bytes);
  const photo = await prisma.photo.create({
    data: {
      profileId: profile.id,
      storageKey,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      width: processed.width,
      height: processed.height,
    },
  });
  await bumpStep(profile.id, profile.onboardingStep, STEP_INDEX.photos);

  return { status: "success", photo: { id: photo.id, url: await resolvePhotoUrl(storageKey) } };
}

export type RemovePhotoState =
  | { status: "idle" }
  | { status: "success"; photoId: string }
  | { status: "error"; code: string };

export async function removePhoto(_prev: RemovePhotoState, formData: FormData): Promise<RemovePhotoState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return { status: "error", code: "INVALID_INPUT" };

  const profile = await ensureProfile(actor.userId);
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.profileId !== profile.id) {
    return { status: "error", code: "NOT_FOUND" };
  }

  await deletePhoto(photo.storageKey);
  await prisma.photo.delete({ where: { id: photoId } });

  return { status: "success", photoId };
}

export type FinishState =
  | { status: "idle" }
  | { status: "complete" }
  | { status: "incomplete"; missing: string[] }
  | { status: "error"; code: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature; this step needs no form fields
export async function finishProfile(_prev: FinishState, _formData: FormData): Promise<FinishState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const profile = await ensureProfile(actor.userId);
  const [promptCount, photoCount] = await Promise.all([
    prisma.promptAnswer.count({ where: { profileId: profile.id } }),
    prisma.photo.count({ where: { profileId: profile.id } }),
  ]);

  const complete = isProfileComplete({
    hasBasics: Boolean(profile.firstName && profile.gender && profile.major && profile.year),
    intentCount: profile.intents.length,
    valuesAnswerCount: profile.valuesAnswers.length,
    promptCount,
    photoCount,
  });

  if (!complete) {
    return { status: "incomplete", missing: await getMissingRequiredSteps(actor.userId) };
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { completedAt: profile.completedAt ?? new Date(), onboardingStep: STEP_INDEX.preview },
  });

  return { status: "complete" };
}
