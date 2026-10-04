import { describe, expect, it } from "vitest";
import { IntentMode } from "@/generated/prisma/enums";
import { NEUTRAL_SLIDERS, personalizeWeights } from "./personalize";
import { INTENT_WEIGHTS } from "./weights";

const sum = (w: { wC: number; wK: number; wT: number; wI: number; wV: number }) =>
  w.wC + w.wK + w.wT + w.wI + w.wV;

describe("personalizeWeights", () => {
  it("leaves the intent vector unchanged at neutral sliders", () => {
    for (const intent of Object.values(IntentMode)) {
      const base = INTENT_WEIGHTS[intent];
      const out = personalizeWeights(base, NEUTRAL_SLIDERS);
      for (const key of ["wC", "wK", "wT", "wI", "wV"] as const) {
        expect(out[key]).toBeCloseTo(base[key], 10);
      }
    }
  });

  it("always renormalizes to a sum of 1", () => {
    for (const intent of Object.values(IntentMode)) {
      for (const classes of [0.5, 1, 1.5]) {
        for (const interests of [0.5, 1.25, 1.5]) {
          for (const freeTime of [0.5, 0.75, 1.5]) {
            const out = personalizeWeights(INTENT_WEIGHTS[intent], { classes, interests, freeTime });
            expect(sum(out)).toBeCloseTo(1, 10);
          }
        }
      }
    }
  });

  it("raising a slider raises that weight's share and lowers the others", () => {
    const base = INTENT_WEIGHTS[IntentMode.FRIENDS];
    const out = personalizeWeights(base, { classes: 1.5, interests: 1, freeTime: 1 });
    expect(out.wC).toBeGreaterThan(base.wC);
    expect(out.wK).toBeLessThan(base.wK);
    expect(out.wI).toBeLessThan(base.wI);
    expect(out.wV).toBeLessThan(base.wV);
  });

  it("clamps out-of-range or non-finite slider values", () => {
    const base = INTENT_WEIGHTS[IntentMode.STUDY];
    expect(personalizeWeights(base, { classes: 9, interests: 1, freeTime: 1 })).toEqual(
      personalizeWeights(base, { classes: 1.5, interests: 1, freeTime: 1 }),
    );
    expect(personalizeWeights(base, { classes: Number.NaN, interests: 0, freeTime: 1 })).toEqual(
      personalizeWeights(base, { classes: 1, interests: 0.5, freeTime: 1 }),
    );
  });
});
