import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeForSearch, normalizeQuery } from "./normalize";

describe("normalizeForSearch", () => {
  it("lowercases and removes whitespace", () => {
    expect(normalizeForSearch("Data Structures")).toBe("datastructures");
  });

  it("removes whitespace from Korean text so spacing variants match", () => {
    expect(normalizeForSearch("자료 구조")).toBe(normalizeForSearch("자료구조"));
  });

  it("folds full-width characters to their standard form (NFKC)", () => {
    expect(normalizeForSearch("ＣＳＥ２０１０")).toBe("cse2010");
  });
});

describe("buildSearchText / normalizeQuery agreement", () => {
  it("a normalized query is found inside the built search text", () => {
    const text = buildSearchText("CSE2010", "자료구조", "Data Structures");
    expect(text).toContain(normalizeQuery("자료 구조"));
    expect(text).toContain(normalizeQuery("cse2010"));
    expect(text).toContain(normalizeQuery("Data Structures"));
  });

  it("skips null/undefined fields", () => {
    expect(buildSearchText("a", null, undefined, "b")).toBe("a|b");
  });

  it("a query cannot straddle two joined fields", () => {
    const text = buildSearchText("ab", "cd");
    expect(text).not.toContain(normalizeQuery("abcd"));
  });
});
