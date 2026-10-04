/**
 * J5 privacy-safe shareable cards. A card never states an exact headcount: counts are
 * floored to a coarse bucket, and below the minimum there is no card at all, so a card
 * can't be used to work out who in a small class is on Overlap.
 */
export const MIN_SHAREABLE_COUNT = 5;
const BUCKETS = [100, 50, 20, 10, 5] as const;

/** The "N+" a card may show, or null when the group is too small to share. */
export function shareBucket(count: number): number | null {
  if (!Number.isFinite(count) || count < MIN_SHAREABLE_COUNT) return null;
  return BUCKETS.find((b) => count >= b) ?? null;
}
