import * as z from "zod";
import { Gender, IntentMode } from "@/generated/prisma/enums";

/**
 * Per-step validation for the onboarding profile wizard (S07/B1-B10). Every step
 * submits plain, fixed-shape form fields (no client-serialized JSON) so multi-value
 * fields use `formData.getAll(name)` at the call site instead of the lossy
 * `Object.fromEntries()` shortcut the account-onboarding step uses for its
 * single-value fields (src/server/auth/schema.ts).
 */

export const MAX_COURSES = 10;
export const MAX_CLUBS = 10;
export const MAX_SPOTS = 10;
export const MAX_INTERESTS = 12;
export const MAX_FREE_TEXT_INTERESTS = 5;
export const PROMPT_ANSWER_MAX_LENGTH = 200;
export const REQUIRED_PROMPT_COUNT = 3;
export const VALUES_QUIZ_LENGTH = 8;
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;
/** Day (0=Mon..6=Sun) * 12 two-hour blocks/day - 1. */
export const MAX_FREE_TIME_SLOT = 7 * 12 - 1;

export const basicsSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(50),
  gender: z.enum(Gender),
  pronouns: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  year: z.coerce.number().int().min(1).max(8),
  major: z.string().trim().min(1, "Required").max(100),
  // Only meaningful (and only ever submitted) when the sensitive consent was granted;
  // src/server/profile/actions.ts drops it otherwise regardless of what's posted.
  interestedIn: z.array(z.enum(Gender)).max(4).default([]),
});

export const intentsSchema = z.object({
  intents: z.array(z.enum(IntentMode)).min(1, "Pick at least one."),
});

export const coursesSchema = z.object({
  courseIds: z.array(z.string().min(1)).max(MAX_COURSES),
});

export const clubsSchema = z.object({
  clubIds: z.array(z.string().min(1)).max(MAX_CLUBS),
});

export const spotsSchema = z.object({
  spotIds: z.array(z.string().min(1)).max(MAX_SPOTS),
});

export const freeTimeSchema = z.object({
  slots: z.array(z.coerce.number().int().min(0).max(MAX_FREE_TIME_SLOT)),
});

export const interestsSchema = z.object({
  interestTagIds: z.array(z.string().min(1)).max(MAX_INTERESTS),
  freeText: z.array(z.string().trim().min(1).max(30)).max(MAX_FREE_TEXT_INTERESTS).default([]),
});

export const promptsSchema = z.object({
  promptIds: z.array(z.string().min(1)).length(REQUIRED_PROMPT_COUNT),
  answers: z
    .array(z.string().trim().min(1).max(PROMPT_ANSWER_MAX_LENGTH))
    .length(REQUIRED_PROMPT_COUNT),
});

export const valuesQuizSchema = z.object({
  answers: z.array(z.coerce.number().int().min(1).max(5)).length(VALUES_QUIZ_LENGTH),
});
