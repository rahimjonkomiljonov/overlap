import { describe, expect, it } from "vitest";
import { createRng, nextInt, pick, pickN, shuffle } from "./rng";

describe("createRng", () => {
  it("produces the exact same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("nextInt", () => {
  it("stays within [min, max] inclusive, and can hit both ends", () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const value = nextInt(rng, 1, 5);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("pick / pickN / shuffle", () => {
  it("pick returns an element that was actually in the array", () => {
    const rng = createRng(9);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 20; i++) {
      expect(items).toContain(pick(rng, items));
    }
  });

  it("pick throws on an empty array rather than returning undefined", () => {
    expect(() => pick(createRng(1), [])).toThrow();
  });

  it("pickN returns distinct elements, clamped to the array length", () => {
    const rng = createRng(11);
    const items = [1, 2, 3, 4, 5];
    const picked = pickN(rng, items, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    for (const p of picked) expect(items).toContain(p);

    expect(pickN(createRng(1), items, 10)).toHaveLength(items.length);
  });

  it("shuffle is a permutation and does not mutate its input", () => {
    const rng = createRng(5);
    const items = [1, 2, 3, 4, 5];
    const shuffled = shuffle(rng, items);
    expect(shuffled).not.toBe(items);
    expect([...shuffled].sort()).toEqual(items);
  });
});
