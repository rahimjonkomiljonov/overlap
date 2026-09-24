import type { IntentMode } from "@/generated/prisma/enums";
import type { CampusMatchPool, LoadedProfile } from "./candidates";
import { buildExplanations, type Explanation } from "./explain";
import { passesGenderFilter } from "./filters";
import { reciprocityScore, scoreFromTerms } from "./score";
import { computeMatchTerms, type IdfLookup } from "./terms";
import { INTENT_WEIGHTS } from "./weights";

export interface RankedCandidate {
  candidateUserId: string;
  score: number;
  reasons: Explanation[];
}

/**
 * All-pairs scoring for one campus+intent, entirely in memory over data
 * `loadCampusMatchPool` already fetched in a handful of bulk queries — this is what
 * makes a 1,000-user run finish in well under a minute (S10's own "Done when"): term
 * computation for an unordered pair happens exactly once (it's symmetric — terms.ts),
 * with only the cheap exclusion checks (block/hide/gender/recently-shown) run per
 * direction, since those genuinely can differ depending on who's looking. Returns every
 * eligible candidate, fully ranked — composing that into an actual 6-pick batch (4 top +
 * 1 adjacent + 1 newcomer, exposure cap) is S11's job, not this function's.
 */
export function computeCampusMatches(pool: CampusMatchPool, intent: IntentMode, idf: IdfLookup): Map<string, RankedCandidate[]> {
  const weights = INTENT_WEIGHTS[intent];
  const results = new Map<string, RankedCandidate[]>();
  for (const profile of pool.profiles) {
    results.set(profile.userId, []);
  }

  const { profiles } = pool;
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      if (pool.blockedPairs.has(blockPairKey(a.userId, b.userId))) continue;

      const terms = computeMatchTerms(a, b, idf);
      // Symmetric today (no personalization exists to make the two directions differ — see score.ts), computed this way so nothing here needs to change once it does.
      const scoreAtoB = scoreFromTerms(terms, weights);
      const scoreBtoA = scoreFromTerms(terms, weights);
      const score = reciprocityScore(scoreAtoB, scoreBtoA);
      const reasons = buildExplanations(terms, weights);

      if (isEligibleDirection(pool, a, b, intent)) {
        results.get(a.userId)!.push({ candidateUserId: b.userId, score, reasons });
      }
      if (isEligibleDirection(pool, b, a, intent)) {
        results.get(b.userId)!.push({ candidateUserId: a.userId, score, reasons });
      }
    }
  }

  for (const list of results.values()) {
    list.sort((x, y) => y.score - x.score);
  }
  return results;
}

function isEligibleDirection(pool: CampusMatchPool, viewer: LoadedProfile, candidate: LoadedProfile, intent: IntentMode): boolean {
  if (pool.hiddenBy.get(viewer.userId)?.has(candidate.userId)) return false;
  if (pool.recentlyShown.get(viewer.userId)?.has(candidate.userId)) return false;
  return passesGenderFilter(intent, viewer, candidate);
}

function blockPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
