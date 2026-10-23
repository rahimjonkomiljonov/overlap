import { decryptField } from "@/server/privacy/encryption";
import { prisma } from "@/server/db";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { REQUIRED_PROMPT_COUNT, VALUES_QUIZ_LENGTH } from "./schema";
import { ensureProfileWith } from "./service";
import { calculateProfileStrength } from "./strength";

/**
 * Creates an empty Profile row on first visit to /onboarding/profile, so every step
 * from here on is a plain update against a row that's guaranteed to exist.
 */
export async function ensureProfile(userId: string) {
  return ensureProfileWith(prisma, userId);
}

/** Cheap check for the (app) layout guard — does not create a Profile row. */
export async function hasCompletedProfile(userId: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { completedAt: true },
  });
  return profile?.completedAt != null;
}

export type WizardPhoto = { id: string; url: string; sortOrder: number };

export type WizardState = {
  onboardingStep: number;
  completedAt: Date | null;
  strength: number;
  firstName: string;
  gender: string | null;
  pronouns: string;
  year: number | null;
  major: string;
  interestedIn: string[]; // decrypted Gender values, owner-facing only
  intents: string[];
  courses: { id: string; code: string; title: string }[];
  clubs: { id: string; name: string }[];
  spots: { id: string; name: string }[];
  freeTimeSlots: number[];
  interestTags: { id: string; labelKo: string; labelEn: string }[];
  freeText: string[];
  prompts: { promptId: string; textKo: string; textEn: string; answer: string }[];
  valuesAnswers: number[];
  photos: WizardPhoto[];
};

/** Full hydration for the wizard UI — one query per relation, kept simple over clever. */
export async function getWizardState(userId: string): Promise<WizardState> {
  const profile = await ensureProfile(userId);

  const [courses, clubs, spots, interestTags, promptAnswers, photos] = await Promise.all([
    prisma.profileCourse.findMany({
      where: { profileId: profile.id },
      include: { course: { select: { id: true, code: true, title: true } } },
    }),
    prisma.profileClub.findMany({
      where: { profileId: profile.id },
      include: { club: { select: { id: true, name: true } } },
    }),
    prisma.profileSpot.findMany({
      where: { profileId: profile.id },
      include: { spot: { select: { id: true, name: true } } },
    }),
    prisma.profileInterestTag.findMany({
      where: { profileId: profile.id },
      include: { interestTag: { select: { id: true, labelKo: true, labelEn: true } } },
    }),
    prisma.promptAnswer.findMany({
      where: { profileId: profile.id },
      include: { prompt: { select: { textKo: true, textEn: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.photo.findMany({ where: { profileId: profile.id }, orderBy: { sortOrder: "asc" } }),
  ]);

  const photoUrls = await Promise.all(photos.map((p) => resolvePhotoUrl(p.storageKey)));

  return {
    onboardingStep: profile.onboardingStep,
    completedAt: profile.completedAt,
    strength: calculateProfileStrength({
      hasBasics: Boolean(profile.firstName && profile.gender && profile.major && profile.year),
      intentCount: profile.intents.length,
      courseCount: courses.length,
      clubCount: clubs.length,
      spotCount: spots.length,
      freeTimeSlotCount: profile.freeTimeSlots.length,
      interestCount: interestTags.length + profile.interestsFreeText.length,
      promptCount: promptAnswers.length,
      valuesAnswerCount: profile.valuesAnswers.length,
      photoCount: photos.length,
    }),
    firstName: profile.firstName ?? "",
    gender: profile.gender,
    pronouns: profile.pronouns ?? "",
    year: profile.year,
    major: profile.major ?? "",
    interestedIn: profile.interestedIn
      ? (JSON.parse(decryptField(profile.interestedIn)) as string[])
      : [],
    intents: profile.intents,
    courses: courses.map((c) => ({ id: c.course.id, code: c.course.code, title: c.course.title })),
    clubs: clubs.map((c) => ({ id: c.club.id, name: c.club.name })),
    spots: spots.map((s) => ({ id: s.spot.id, name: s.spot.name })),
    freeTimeSlots: profile.freeTimeSlots,
    interestTags: interestTags.map((t) => ({
      id: t.interestTag.id,
      labelKo: t.interestTag.labelKo,
      labelEn: t.interestTag.labelEn,
    })),
    freeText: profile.interestsFreeText,
    prompts: promptAnswers.map((a) => ({
      promptId: a.promptId,
      textKo: a.prompt.textKo,
      textEn: a.prompt.textEn,
      answer: a.answer,
    })),
    valuesAnswers: profile.valuesAnswers,
    photos: photos.map((p, i) => ({ id: p.id, url: photoUrls[i], sortOrder: p.sortOrder })),
  };
}

/** What's still missing before `finishProfile` can set `completedAt` (for the preview step's checklist). */
export async function getMissingRequiredSteps(userId: string): Promise<string[]> {
  const profile = await ensureProfile(userId);
  const [promptCount, photoCount] = await Promise.all([
    prisma.promptAnswer.count({ where: { profileId: profile.id } }),
    prisma.photo.count({ where: { profileId: profile.id } }),
  ]);

  const missing: string[] = [];
  if (!profile.firstName || !profile.gender || !profile.major || !profile.year)
    missing.push("basics");
  if (profile.intents.length === 0) missing.push("intents");
  if (profile.valuesAnswers.length < VALUES_QUIZ_LENGTH) missing.push("valuesQuiz");
  if (promptCount < REQUIRED_PROMPT_COUNT) missing.push("prompts");
  if (photoCount < 3) missing.push("photos");
  return missing;
}
