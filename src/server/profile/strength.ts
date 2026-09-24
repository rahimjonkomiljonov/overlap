import { MAX_PHOTOS, MIN_PHOTOS, REQUIRED_PROMPT_COUNT, VALUES_QUIZ_LENGTH } from "./schema";

/**
 * "How others see me" / profile-strength meter (B12). Courses, clubs, spots and
 * free-time are optional and interchangeable ("optional steps can be deferred", B1),
 * so any one of them is enough to earn that slice — the required steps (basics,
 * >=1 intent, values quiz, 3 prompts, 3-6 photos) each need their own slice, since
 * `isProfileComplete` requires every one of them regardless of the others.
 */

export type ProfileStrengthInput = {
  hasBasics: boolean;
  intentCount: number;
  courseCount: number;
  clubCount: number;
  spotCount: number;
  freeTimeSlotCount: number;
  interestCount: number;
  promptCount: number;
  valuesAnswerCount: number;
  photoCount: number;
};

const WEIGHTS = {
  basics: 20,
  intents: 15,
  optionalOverlap: 10, // any of courses/clubs/spots/free-time
  interests: 10,
  values: 10,
  prompts: 15,
  photos: 20,
} as const;

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((sum, w) => sum + w, 0);
if (TOTAL_WEIGHT !== 100) {
  throw new Error(`Profile strength weights must sum to 100, got ${TOTAL_WEIGHT}.`);
}

/** 0-100. Not the same test as `isProfileComplete` — this rewards optional steps too. */
export function calculateProfileStrength(input: ProfileStrengthInput): number {
  let score = 0;
  if (input.hasBasics) score += WEIGHTS.basics;
  if (input.intentCount > 0) score += WEIGHTS.intents;
  if (
    input.courseCount > 0 ||
    input.clubCount > 0 ||
    input.spotCount > 0 ||
    input.freeTimeSlotCount > 0
  ) {
    score += WEIGHTS.optionalOverlap;
  }
  if (input.interestCount > 0) score += WEIGHTS.interests;
  if (input.valuesAnswerCount >= VALUES_QUIZ_LENGTH) score += WEIGHTS.values;
  if (input.promptCount >= REQUIRED_PROMPT_COUNT) score += WEIGHTS.prompts;
  if (input.photoCount >= MIN_PHOTOS) score += WEIGHTS.photos;
  return score;
}

export type RequiredStepsInput = Pick<
  ProfileStrengthInput,
  "hasBasics" | "intentCount" | "valuesAnswerCount" | "promptCount" | "photoCount"
>;

/** Every required step is done — gates leaving /onboarding/profile (S07 done-when). */
export function isProfileComplete(input: RequiredStepsInput): boolean {
  return (
    input.hasBasics &&
    input.intentCount > 0 &&
    input.valuesAnswerCount >= VALUES_QUIZ_LENGTH &&
    input.promptCount >= REQUIRED_PROMPT_COUNT &&
    input.photoCount >= MIN_PHOTOS &&
    input.photoCount <= MAX_PHOTOS
  );
}
