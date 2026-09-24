import * as z from "zod";
import { TERM_PATTERN } from "./term";

/** Row shape for `courses.csv` — one row per course, term-scoped (B4). */
export const courseRowSchema = z.object({
  term: z.string().regex(TERM_PATTERN, "term must look like 2026-1, 2026-2, 2026-S or 2026-W"),
  code: z.string().min(1),
  title: z.string().min(1),
  title_en: z.string().optional(),
  section: z.string().min(1),
  instructor: z.string().optional(),
  meeting_times: z.string().optional(),
});
export type CourseRow = z.infer<typeof courseRowSchema>;

/** Row shape for `clubs.csv` (B5). */
export const clubRowSchema = z.object({
  name: z.string().min(1),
  name_en: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
});
export type ClubRow = z.infer<typeof clubRowSchema>;

const SPOT_KINDS = ["CAFE", "LIBRARY", "DINING", "LOUNGE", "OUTDOOR", "SPORTS", "OTHER"] as const;

/** Row shape for `spots.csv` (B6). `is_safe_spot` is "true"/"false" as CSV text. */
export const spotRowSchema = z.object({
  name: z.string().min(1),
  name_en: z.string().optional(),
  kind: z.enum(SPOT_KINDS),
  is_safe_spot: z.enum(["true", "false"]),
  description: z.string().optional(),
});
export type SpotRow = z.infer<typeof spotRowSchema>;

const INTEREST_CATEGORIES = [
  "ARTS",
  "MUSIC",
  "SPORTS",
  "OUTDOORS",
  "FOOD",
  "GAMES",
  "TECH",
  "READING",
  "FILM_TV",
  "TRAVEL",
  "LEARNING",
  "SOCIAL",
  "LIFESTYLE",
] as const;

/** Row shape for `interests.csv` (B8) — the shared, non-sensitive taxonomy. */
export const interestRowSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case, e.g. \"board-games\""),
  category: z.enum(INTEREST_CATEGORIES),
  label_ko: z.string().min(1),
  label_en: z.string().min(1),
});
export type InterestRow = z.infer<typeof interestRowSchema>;

/** Row shape for `prompts.csv` (B9). */
export const promptRowSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, "key must be lowercase kebab/snake case"),
  category: z.string().min(1),
  text_ko: z.string().min(1).max(200),
  text_en: z.string().min(1).max(200),
  sort_order: z.string().regex(/^\d+$/).optional(),
});
export type PromptRow = z.infer<typeof promptRowSchema>;

/**
 * `safety-contacts.json` (G6): campus-specific numbers only — the national emergency
 * numbers (112/119/1366/디지털성범죄피해자지원센터) are code constants
 * (src/server/safety/emergency.ts), not imported data, so they can never be typo'd or
 * left out by a per-campus config.
 */
export const safetyResourcesSchema = z.object({
  campusSecurityPhone: z.string().min(1),
  counselingCenterPhone: z.string().min(1),
  sexualViolenceCenterPhone: z.string().min(1),
  sexualViolenceCenterHours: z.string().optional(),
});
export type SafetyResources = z.infer<typeof safetyResourcesSchema>;
