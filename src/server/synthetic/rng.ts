/**
 * A tiny seeded PRNG (mulberry32) so the synthetic-campus generator (S09) is
 * deterministic: the same seed always produces the same campus, which is the step's own
 * "Done when" requirement. `Math.random()` can't be seeded, so it's never used here.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in `[min, max]`, inclusive on both ends. */
export function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One random element of a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pick: items is empty");
  }
  return items[nextInt(rng, 0, items.length - 1)];
}

/** `count` distinct elements of `items`, order shuffled. `count` is clamped to the array's length. */
export function pickN<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const shuffled = shuffle(rng, items);
  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
}

/** Fisher–Yates shuffle, driven by `rng` so it stays deterministic. Does not mutate `items`. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
