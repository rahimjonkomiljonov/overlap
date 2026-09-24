import { Gender, IntentMode } from "@/generated/prisma/enums";
import { createRng, nextInt, pick, pickN, type Rng } from "./rng";

/** 2-hour free-time blocks: 7 days × 12 blocks/day (Profile.freeTimeSlots, S07). */
const SLOT_COUNT = 7 * 12;
const VALUES_QUIZ_LENGTH = 8;
const GENDERS = Object.values(Gender);
const INTENTS = Object.values(IntentMode);
const MAJORS = [
  "컴퓨터공학",
  "경영학",
  "심리학",
  "전자공학",
  "국어국문학",
  "화학공학",
  "디자인학",
  "경제학",
  "기계공학",
  "사회학",
] as const;

/** The reference-data ids a community can be planted around — one campus's worth. */
export interface SyntheticReferenceData {
  courseIds: string[];
  clubIds: string[];
  interestTagIds: string[];
  promptIds: string[];
}

export interface SyntheticUserPlan {
  index: number;
  communityIndex: number;
  email: string;
  firstName: string;
  gender: Gender;
  birthYear: number;
  year: number;
  major: string;
  intents: IntentMode[];
  /** Only set when `intents` includes DATING — mirrors the real onboarding invariant (src/server/profile/actions.ts's DATING_REQUIRES_CONSENT) that this can't exist otherwise. */
  interestedIn: Gender[] | null;
  freeTimeSlots: number[];
  valuesAnswers: number[];
  courseIds: string[];
  clubIds: string[];
  interestTagIds: string[];
  promptAnswers: { promptId: string; answer: string; sortOrder: number }[];
}

export interface SyntheticCampusPlan {
  seed: number;
  campusId: string;
  users: SyntheticUserPlan[];
}

export interface PlanSyntheticCampusOptions {
  campusId: string;
  seed: number;
  userCount: number;
  communityCount: number;
  /** Injectable so tests don't depend on `Date.now()`'s current year. */
  currentYear?: number;
}

interface CommunityTemplate {
  courseIds: string[];
  clubIds: string[];
  interestTagIds: string[];
  baseFreeTimeSlots: number[];
  baseValues: number[];
}

/**
 * Pure, deterministic: the same `options` and `reference` always produce byte-identical
 * output (S09's own "Done when" requirement), so this has no I/O — persist.ts is the
 * thin layer that turns this plan into database rows. Communities are "planted" by
 * giving every member of a community the exact same courses/clubs (real students
 * genuinely do share exact courses) and a jittered variant of the community's free-time
 * pattern and values-quiz answers (so members are close but not identical, like real
 * people) — this is the ground truth S10's offline precision@6 evaluation checks
 * against (REQUIREMENTS.md §5.5).
 */
export function planSyntheticCampus(
  options: PlanSyntheticCampusOptions,
  reference: SyntheticReferenceData,
): SyntheticCampusPlan {
  if (reference.courseIds.length === 0 || reference.clubIds.length === 0) {
    throw new Error(
      "planSyntheticCampus: campus has no courses/clubs to plant communities around — run db:import-reference first.",
    );
  }
  if (reference.interestTagIds.length === 0 || reference.promptIds.length === 0) {
    throw new Error(
      "planSyntheticCampus: no interest tags or prompts available — run db:import-reference first.",
    );
  }
  const communityCount = Math.max(1, Math.min(options.communityCount, options.userCount));
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const rng = createRng(options.seed);

  const communities: CommunityTemplate[] = Array.from({ length: communityCount }, () => ({
    courseIds: pickN(rng, reference.courseIds, Math.min(2, reference.courseIds.length)),
    clubIds: pickN(rng, reference.clubIds, Math.min(1, reference.clubIds.length)),
    interestTagIds: pickN(rng, reference.interestTagIds, Math.min(4, reference.interestTagIds.length)),
    baseFreeTimeSlots: pickN(
      rng,
      Array.from({ length: SLOT_COUNT }, (_, i) => i),
      nextInt(rng, 6, 10),
    ),
    baseValues: Array.from({ length: VALUES_QUIZ_LENGTH }, () => nextInt(rng, 1, 5)),
  }));

  const usersPerCommunity = distributeEvenly(options.userCount, communityCount);
  const users: SyntheticUserPlan[] = [];
  let index = 0;

  for (let c = 0; c < communityCount; c++) {
    const template = communities[c];
    for (let j = 0; j < usersPerCommunity[c]; j++) {
      users.push(planOneUser(rng, index, c, template, currentYear, reference.promptIds));
      index++;
    }
  }

  return { seed: options.seed, campusId: options.campusId, users };
}

function planOneUser(
  rng: Rng,
  index: number,
  communityIndex: number,
  template: CommunityTemplate,
  currentYear: number,
  promptIds: string[],
): SyntheticUserPlan {
  const paddedIndex = String(index).padStart(6, "0");
  const promptCount = Math.min(3, promptIds.length);
  const intents = pickN(rng, INTENTS, nextInt(rng, 1, 2));
  // Deliberately not correlated with `gender`: this is test data for exercising the
  // matching engine's overlap signals (S10), not a realistic orientation distribution —
  // a wide, uncorrelated spread just keeps the Dating gender hard filter from
  // degenerately excluding almost everyone.
  const interestedIn = intents.includes(IntentMode.DATING) ? pickN(rng, GENDERS, nextInt(rng, 1, 3)) : null;

  return {
    index,
    communityIndex,
    email: `u${paddedIndex}@synthetic.overlap.invalid`,
    firstName: `Synthetic-C${communityIndex}-${paddedIndex}`,
    gender: pick(rng, GENDERS),
    birthYear: currentYear - nextInt(rng, 19, 25),
    year: nextInt(rng, 1, 4),
    major: pick(rng, MAJORS),
    intents,
    interestedIn,
    freeTimeSlots: jitterSlots(rng, template.baseFreeTimeSlots),
    valuesAnswers: template.baseValues.map((v) => clamp(v + (nextInt(rng, 0, 2) - 1), 1, 5)),
    courseIds: template.courseIds,
    clubIds: template.clubIds,
    interestTagIds: dropoutSample(rng, template.interestTagIds, 0.2),
    promptAnswers: pickN(rng, promptIds, promptCount).map((promptId, i) => ({
      promptId,
      answer: `Synthetic profile answer #${i + 1} (community ${communityIndex}).`,
      sortOrder: i,
    })),
  };
}

/** The community's base slots, plus/minus a little jitter — never empty. */
function jitterSlots(rng: Rng, base: number[]): number[] {
  const kept = base.filter(() => rng() > 0.15);
  const extra = nextInt(rng, 0, 2);
  const slots = new Set(kept.length > 0 ? kept : base);
  for (let i = 0; i < extra; i++) {
    slots.add(nextInt(rng, 0, SLOT_COUNT - 1));
  }
  return [...slots].sort((a, b) => a - b);
}

/** Each item is independently dropped with probability `dropoutProb`, keeping at least one. */
function dropoutSample<T>(rng: Rng, items: readonly T[], dropoutProb: number): T[] {
  const kept = items.filter(() => rng() >= dropoutProb);
  return kept.length > 0 ? kept : items.slice(0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Splits `total` into `parts` integers as evenly as possible (earlier parts get the remainder). */
function distributeEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
