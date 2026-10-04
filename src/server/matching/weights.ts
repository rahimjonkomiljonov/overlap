import { IntentMode } from "@/generated/prisma/enums";

/** The five terms in S(a,b) = 100 × (wC·C + wK·K + wT·T + wI·I + wV·V), REQUIREMENTS.md §5.2. */
export interface MatchWeights {
  wC: number;
  wK: number;
  wT: number;
  wI: number;
  wV: number;
}

/**
 * Per-intent weight vectors, straight from REQUIREMENTS.md §5.2's table — except `OPEN`
 * ("다 열려있어요" in the onboarding UI), which that table doesn't cover: it's the
 * unweighted average of the other three, since "open to anything" is the one intent that
 * shouldn't presume any particular kind of overlap matters more.
 *
 * Each user's B11 "what matters" sliders then scale wC/wI/wT by 0.5×-1.5× and
 * renormalize (§5.2's "Personalization", src/server/matching/personalize.ts).
 */
export const INTENT_WEIGHTS: Record<IntentMode, MatchWeights> = {
  [IntentMode.STUDY]: { wC: 0.45, wK: 0.1, wT: 0.3, wI: 0.1, wV: 0.05 },
  [IntentMode.FRIENDS]: { wC: 0.2, wK: 0.25, wT: 0.2, wI: 0.3, wV: 0.05 },
  [IntentMode.DATING]: { wC: 0.15, wK: 0.15, wT: 0.15, wI: 0.25, wV: 0.3 },
  [IntentMode.OPEN]: averageWeights([
    { wC: 0.45, wK: 0.1, wT: 0.3, wI: 0.1, wV: 0.05 },
    { wC: 0.2, wK: 0.25, wT: 0.2, wI: 0.3, wV: 0.05 },
    { wC: 0.15, wK: 0.15, wT: 0.15, wI: 0.25, wV: 0.3 },
  ]),
};

function averageWeights(weights: MatchWeights[]): MatchWeights {
  const sum = weights.reduce(
    (acc, w) => ({ wC: acc.wC + w.wC, wK: acc.wK + w.wK, wT: acc.wT + w.wT, wI: acc.wI + w.wI, wV: acc.wV + w.wV }),
    { wC: 0, wK: 0, wT: 0, wI: 0, wV: 0 },
  );
  const n = weights.length;
  return { wC: sum.wC / n, wK: sum.wK / n, wT: sum.wT / n, wI: sum.wI / n, wV: sum.wV / n };
}
