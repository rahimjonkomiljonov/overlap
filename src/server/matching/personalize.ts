import type { MatchWeights } from "./weights";

/** B11's three "what matters to me" sliders, each a multiplier on one weight. */
export interface WeightSliders {
  /** Scales wC (shared classes). */
  classes: number;
  /** Scales wI (shared interests). */
  interests: number;
  /** Scales wT (shared free time). */
  freeTime: number;
}

export const SLIDER_MIN = 0.5;
export const SLIDER_MAX = 1.5;
export const SLIDER_STEP = 0.25;
export const NEUTRAL_SLIDERS: WeightSliders = { classes: 1, interests: 1, freeTime: 1 };

function clampSlider(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
}

/**
 * §5.2 "Personalization": scale wC/wI/wT by the user's sliders (0.5×-1.5×), then
 * renormalize so the weights still sum to 1 and S stays in [0,100]. wK and wV are
 * left unscaled before renormalizing, so turning everything up shifts weight away
 * from them, which is what "these matter more to me" means.
 */
export function personalizeWeights(base: MatchWeights, sliders: WeightSliders): MatchWeights {
  const scaled = {
    wC: base.wC * clampSlider(sliders.classes),
    wK: base.wK,
    wT: base.wT * clampSlider(sliders.freeTime),
    wI: base.wI * clampSlider(sliders.interests),
    wV: base.wV,
  };
  const total = scaled.wC + scaled.wK + scaled.wT + scaled.wI + scaled.wV;
  if (total <= 0) return base;
  return {
    wC: scaled.wC / total,
    wK: scaled.wK / total,
    wT: scaled.wT / total,
    wI: scaled.wI / total,
    wV: scaled.wV / total,
  };
}
