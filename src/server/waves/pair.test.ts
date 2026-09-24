import { describe, expect, it } from "vitest";
import { orderedPair } from "./pair";

describe("orderedPair", () => {
  it("orders lexicographically regardless of argument order", () => {
    expect(orderedPair("a", "b")).toEqual(["a", "b"]);
    expect(orderedPair("b", "a")).toEqual(["a", "b"]);
  });

  it("is symmetric: swapping arguments gives the same result", () => {
    const uuidA = "11111111-1111-1111-1111-111111111111";
    const uuidB = "22222222-2222-2222-2222-222222222222";
    expect(orderedPair(uuidA, uuidB)).toEqual(orderedPair(uuidB, uuidA));
  });
});
