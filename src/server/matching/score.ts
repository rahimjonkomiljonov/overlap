import type { MatchTerms } from "./terms";
import type { MatchWeights } from "./weights";

/** S(a,b) = 100 × (wC·C + wK·K + wT·T + wI·I + wV·V) — REQUIREMENTS.md §5.2. Each term is already clamped to [0,1], so this is bounded to [0,100] as long as the weights sum to 1. */
export function scoreFromTerms(terms: MatchTerms, weights: MatchWeights): number {
  const raw =
    weights.wC * terms.C + weights.wK * terms.K + weights.wT * terms.T + weights.wI * terms.I + weights.wV * terms.V;
  return 100 * Math.max(0, Math.min(1, raw));
}

/**
 * "Rank by the harmonic mean" (§5.2) of each side's own one-way score, so a candidate
 * only ranks highly if the match is good for *both* people, not just one — the harmonic
 * mean punishes a lopsided pair (one very high, one very low) far more than an
 * arithmetic mean would. Currently `scoreAtoB` and `scoreBtoA` are always equal (every
 * term in terms.ts is symmetric and today's per-intent weight vector has no
 * personalization — see weights.ts), which makes this an identity operation in
 * practice; it's still computed properly so nothing has to change here once
 * personalization sliders exist.
 */
export function reciprocityScore(scoreAtoB: number, scoreBtoA: number): number {
  if (scoreAtoB <= 0 || scoreBtoA <= 0) return 0;
  return (2 * scoreAtoB * scoreBtoA) / (scoreAtoB + scoreBtoA);
}
