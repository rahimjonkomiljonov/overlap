/**
 * G10 internal trust score. Deliberately small and explainable: every point lost maps to
 * one signal the user can see on their own safety page (`explainTrust`), and the only
 * effect is a reach limit in matching, never a suspension or ban. Those stay human
 * decisions (G8), and a moderator can lift the limit on appeal.
 */

/** How far back signals count. Older history stops affecting reach on its own. */
export const TRUST_WINDOW_DAYS = 180;
/** At or below this score, reach is limited. */
export const REACH_LIMIT_THRESHOLD = 55;
/** A reach-limited candidate's score in other people's rankings is multiplied by this. */
export const REACH_LIMIT_FACTOR = 0.5;
/** How long an accepted appeal lifts the limit. */
export const REACH_RESTORE_DAYS = 90;

export const TRUST_PENALTIES = {
  /** Per distinct person whose report wasn't dismissed by a moderator. */
  reporter: 15,
  /** Per moderator warning. */
  warning: 20,
  /** Per distinct person who said a meetup made them uncomfortable. */
  uncomfortableMeetup: 10,
} as const;

export interface TrustSignals {
  reporters: number;
  warnings: number;
  uncomfortableMeetups: number;
}

export const NO_SIGNALS: TrustSignals = { reporters: 0, warnings: 0, uncomfortableMeetups: 0 };

export function computeTrustScore(signals: TrustSignals): number {
  const penalty =
    signals.reporters * TRUST_PENALTIES.reporter +
    signals.warnings * TRUST_PENALTIES.warning +
    signals.uncomfortableMeetups * TRUST_PENALTIES.uncomfortableMeetup;
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function isReachLimited(score: number, reachRestoredUntil: Date | null, now: Date): boolean {
  if (reachRestoredUntil && reachRestoredUntil.getTime() > now.getTime()) return false;
  return score <= REACH_LIMIT_THRESHOLD;
}

export type TrustReason = { type: keyof TrustSignals; count: number };

/** The signals behind a score, for the user's own explanation. Counts only, never who. */
export function explainTrust(signals: TrustSignals): TrustReason[] {
  return (Object.keys(TRUST_PENALTIES) as (keyof typeof TRUST_PENALTIES)[])
    .map((key) => ({ type: signalKey(key), count: signals[signalKey(key)] }))
    .filter((reason) => reason.count > 0);
}

function signalKey(key: keyof typeof TRUST_PENALTIES): keyof TrustSignals {
  return key === "reporter" ? "reporters" : key === "warning" ? "warnings" : "uncomfortableMeetups";
}
