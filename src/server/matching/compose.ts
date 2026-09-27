import type { RankedCandidate } from "./batch";
import type { Explanation } from "./explain";

/** 4 highest-ranked + 1 adjacent + 1 newcomer (REQUIREMENTS.md §5.3). */
const TOP_COUNT = 4;
/** 1-indexed rank band for the "adjacent" slot — avoids a filter bubble. */
const ADJACENT_RANK_MIN = 20;
const ADJACENT_RANK_MAX = 50;
/** "joined ≤ 7 days ago" (§5.3/C6's "7-day new-user boost"). */
const NEWCOMER_WINDOW_DAYS = 7;
/** Also read by src/server/ops/metrics.ts (S21) to judge batch-completeness in the density dashboard. */
export const TARGET_BATCH_SIZE = 6;
/** "a profile appears in at most 25 batches/day" (§5.3). */
export const DAILY_EXPOSURE_CAP = 25;

export interface ComposedItem {
  candidateUserId: string;
  score: number;
  reasons: Explanation[];
  rank: number;
}

export interface ComposeBatchResult {
  items: ComposedItem[];
  /** Fewer than the target 6 — REQUIREMENTS.md §5.4's low-density case. Never padded with fake/irrelevant profiles; a later step (S12's UI, and eventually Campus Pockets/events, C7+, out of Month-1 scope) is what shows the honest message. */
  lowDensity: boolean;
}

/**
 * Mutates `exposureCounts` as it selects candidates — deliberate, not an oversight: the
 * 25/day exposure cap (§5.3) is a running total across *every* user being composed in
 * the same day's run, so the caller threads one shared counter through every call for a
 * given campus+day (see run-daily-batch.ts). Selection is otherwise a pure function of
 * its inputs: same `ranked`/`context` in, same `items` out, every time.
 */
export function composeBatch(
  ranked: readonly RankedCandidate[],
  context: {
    joinedAtByUserId: ReadonlyMap<string, Date>;
    now: Date;
    exposureCounts: Map<string, number>;
    exposureCap?: number;
  },
): ComposeBatchResult {
  const exposureCap = context.exposureCap ?? DAILY_EXPOSURE_CAP;
  const chosen: ComposedItem[] = [];
  const chosenIds = new Set<string>();

  function tryTake(candidate: RankedCandidate): boolean {
    if (chosenIds.has(candidate.candidateUserId)) return false;
    const count = context.exposureCounts.get(candidate.candidateUserId) ?? 0;
    if (count >= exposureCap) return false;
    chosenIds.add(candidate.candidateUserId);
    chosen.push({ candidateUserId: candidate.candidateUserId, score: candidate.score, reasons: candidate.reasons, rank: 0 });
    context.exposureCounts.set(candidate.candidateUserId, count + 1);
    return true;
  }

  // 4 top: walk down the full ranking (skipping anyone already at the exposure cap).
  for (const candidate of ranked) {
    if (chosen.length >= TOP_COUNT) break;
    tryTake(candidate);
  }

  // 1 adjacent: best-ranked candidate within [20, 50] (1-indexed).
  const adjacentBand = ranked.slice(ADJACENT_RANK_MIN - 1, ADJACENT_RANK_MAX);
  for (const candidate of adjacentBand) {
    if (tryTake(candidate)) break;
  }

  // 1 newcomer: best-ranked candidate, of any rank, who joined within the window.
  for (const candidate of ranked) {
    const joinedAt = context.joinedAtByUserId.get(candidate.candidateUserId);
    if (!joinedAt) continue;
    const ageDays = (context.now.getTime() - joinedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > NEWCOMER_WINDOW_DAYS) continue;
    if (tryTake(candidate)) break;
  }

  chosen.forEach((item, i) => {
    item.rank = i + 1;
  });

  return { items: chosen, lowDensity: chosen.length < TARGET_BATCH_SIZE };
}
