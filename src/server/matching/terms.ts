import { IdfFeatureType } from "@/generated/prisma/enums";

/** `w(x) = log(N / (1 + n_x))`, capped at 0 — see src/server/matching/idf.ts. */
export type IdfLookup = ReadonlyMap<string, number>;

export function idfLookupKey(featureType: IdfFeatureType, featureId: string): string {
  return `${featureType}:${featureId}`;
}

export function buildIdfLookup(
  rows: readonly { featureType: IdfFeatureType; featureId: string; idf: number }[],
): IdfLookup {
  return new Map(rows.map((r) => [idfLookupKey(r.featureType, r.featureId), r.idf]));
}

/** Missing stats degrade to "doesn't count toward rarity" rather than a guessed value. */
function lookupIdf(idf: IdfLookup, featureType: IdfFeatureType, featureId: string): number {
  return idf.get(idfLookupKey(featureType, featureId)) ?? 0;
}

/** One side of a pair being scored — everything the C/K/T/I/V terms need, already decrypted where relevant. */
export interface MatchableProfile {
  userId: string;
  courses: { courseId: string; sectionId: string | null }[];
  clubIds: string[];
  freeTimeSlots: number[];
  spotIds: string[];
  interestTagIds: string[];
  /** 8 Likert answers (1-5), same order both sides (src/server/profile/values-quiz.ts). */
  valuesAnswers: number[];
}

/** Raw 0-1 term values plus the shared items behind them, for explanations (never expose a non-shared item). */
export interface MatchTerms {
  C: number;
  K: number;
  T: number;
  I: number;
  V: number;
  sharedCourseIds: string[];
  /** Subset of sharedCourseIds where both sides also recorded the same section (the +25% bonus). */
  sameSectionCourseIds: string[];
  sharedClubIds: string[];
  sharedInterestTagIds: string[];
  sharedSpotIds: string[];
  sharedFreeTimeSlots: number[];
}

const VALUES_QUIZ_LENGTH = 8;
const VALUES_QUIZ_MAX_DISTANCE_PER_ITEM = 4; // Likert 1-5, so |a-b| maxes out at 4
const SAME_SECTION_BONUS = 1.25;
/** How much of T comes from shared opted-in spots vs. free-time overlap — REQUIREMENTS.md §5.2's "plus shared opted-in spots" doesn't pin an exact ratio, so this keeps time overlap as the dominant signal. */
const SPOT_BONUS_WEIGHT = 0.15;
const SPOT_BONUS_PER_SPOT = 0.15;

/** `sum(idf(x) for x in shared) / sum(idf(x) for x in union)`, generalizing "IDF-weighted Jaccard" (§5.2's I term) to C and K too, since both are described the same way ("IDF-weighted overlap"). 0 when the union is empty — nothing to compare, not undefined. */
function idfWeightedJaccard(
  a: readonly string[],
  b: readonly string[],
  featureType: IdfFeatureType,
  idf: IdfLookup,
  bonusIds: ReadonlySet<string> = new Set(),
  bonusMultiplier = 1,
): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;

  let numerator = 0;
  let denominator = 0;
  for (const id of union) {
    const weight = lookupIdf(idf, featureType, id);
    denominator += weight;
    if (setA.has(id) && setB.has(id)) {
      numerator += bonusIds.has(id) ? weight * bonusMultiplier : weight;
    }
  }
  if (denominator === 0) return 0;
  return clamp01(numerator / denominator);
}

function jaccard<T>(a: readonly T[], b: readonly T[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection++;
  }
  return intersection / union.size;
}

/**
 * Deduplicated intersection, as an array. Built from `Set`s specifically so a duplicate
 * entry within one side's own list (e.g. a data glitch, or — in tests — a random
 * generator that happens to repeat an id) can't inflate a count differently depending on
 * which side happens to have the duplicate; without this, `a.filter(x => b.includes(x))`
 * vs. the same call with `a`/`b` swapped could disagree, breaking this module's whole
 * symmetry guarantee.
 */
function intersectDeduped<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return [...new Set(a)].filter((x) => setB.has(x));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Pure and symmetric: `computeMatchTerms(a, b, idf)` and `computeMatchTerms(b, a, idf)`
 * always agree on every term, since every term here is an intersection/union/distance
 * computation over the same two sets either way round — this is what the "symmetry"
 * property test (S10's own "Done when") checks directly.
 */
export function computeMatchTerms(a: MatchableProfile, b: MatchableProfile, idf: IdfLookup): MatchTerms {
  const aCourseIds = a.courses.map((c) => c.courseId);
  const bCourseIds = b.courses.map((c) => c.courseId);
  const sectionByCourseA = new Map(a.courses.map((c) => [c.courseId, c.sectionId]));
  const sectionByCourseB = new Map(b.courses.map((c) => [c.courseId, c.sectionId]));

  const sharedCourseIds = intersectDeduped(aCourseIds, bCourseIds);
  const sameSectionCourseIds = sharedCourseIds.filter((id) => {
    const sa = sectionByCourseA.get(id);
    const sb = sectionByCourseB.get(id);
    return sa !== null && sa !== undefined && sa === sb;
  });

  const sharedClubIds = intersectDeduped(a.clubIds, b.clubIds);
  const sharedInterestTagIds = intersectDeduped(a.interestTagIds, b.interestTagIds);
  const sharedSpotIds = intersectDeduped(a.spotIds, b.spotIds);
  const sharedFreeTimeSlots = intersectDeduped(a.freeTimeSlots, b.freeTimeSlots);

  const C = idfWeightedJaccard(
    aCourseIds,
    bCourseIds,
    IdfFeatureType.COURSE,
    idf,
    new Set(sameSectionCourseIds),
    SAME_SECTION_BONUS,
  );
  const K = idfWeightedJaccard(a.clubIds, b.clubIds, IdfFeatureType.CLUB, idf);
  const I = idfWeightedJaccard(a.interestTagIds, b.interestTagIds, IdfFeatureType.INTEREST, idf);

  const timeJaccard = jaccard(a.freeTimeSlots, b.freeTimeSlots);
  const spotBonus = Math.min(1, sharedSpotIds.length * SPOT_BONUS_PER_SPOT);
  const T = clamp01(timeJaccard * (1 - SPOT_BONUS_WEIGHT) + spotBonus * SPOT_BONUS_WEIGHT);

  const V = clamp01(1 - valuesDistance(a.valuesAnswers, b.valuesAnswers) / (VALUES_QUIZ_LENGTH * VALUES_QUIZ_MAX_DISTANCE_PER_ITEM));

  return { C, K, T, I, V, sharedCourseIds, sameSectionCourseIds, sharedClubIds, sharedInterestTagIds, sharedSpotIds, sharedFreeTimeSlots };
}

function valuesDistance(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < VALUES_QUIZ_LENGTH; i++) {
    total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return total;
}
