import { describe, expect, it } from "vitest";
import { generateShareToken } from "./token";

describe("generateShareToken", () => {
  it("generates a URL-safe, high-entropy token", () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(24);
  });

  it("generates a different token each call", () => {
    expect(generateShareToken()).not.toBe(generateShareToken());
  });
});
