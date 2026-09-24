import type { MatchTerms } from "./terms";
import type { MatchWeights } from "./weights";

/**
 * Structured data only — never rendered text (§5.2: "top 3 contributing terms are
 * rendered from templates"). The actual copy ("You're both in {course}") lives in the
 * UI layer (next-intl, S12), so a locale or wording change never needs a data backfill.
 * Every id here always comes from the pair's *shared* items — this type has no way to
 * reference a non-shared one, which is what "non-shared items are never exposed" means
 * in practice.
 */
export type Explanation =
  | { type: "course"; courseId: string }
  | { type: "club"; clubId: string }
  | { type: "interest"; interestTagId: string }
  | { type: "freeTime"; day: number; block: number }
  | { type: "values" };

const DEFAULT_MAX_EXPLANATIONS = 3;

/** Picks the top contributing terms (weight × term value), each backed by a real shared item. */
export function buildExplanations(
  terms: MatchTerms,
  weights: MatchWeights,
  maxCount: number = DEFAULT_MAX_EXPLANATIONS,
): Explanation[] {
  const candidates: { contribution: number; explanation: Explanation }[] = [];

  if (terms.sharedCourseIds.length > 0) {
    candidates.push({ contribution: weights.wC * terms.C, explanation: { type: "course", courseId: terms.sharedCourseIds[0] } });
  }
  if (terms.sharedClubIds.length > 0) {
    candidates.push({ contribution: weights.wK * terms.K, explanation: { type: "club", clubId: terms.sharedClubIds[0] } });
  }
  if (terms.sharedInterestTagIds.length > 0) {
    candidates.push({
      contribution: weights.wI * terms.I,
      explanation: { type: "interest", interestTagId: terms.sharedInterestTagIds[0] },
    });
  }
  if (terms.sharedFreeTimeSlots.length > 0) {
    const slot = Math.min(...terms.sharedFreeTimeSlots);
    candidates.push({
      contribution: weights.wT * terms.T,
      explanation: { type: "freeTime", day: Math.floor(slot / 12), block: slot % 12 },
    });
  }
  if (terms.V > 0) {
    candidates.push({ contribution: weights.wV * terms.V, explanation: { type: "values" } });
  }

  return candidates
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, maxCount)
    .map((c) => c.explanation);
}
