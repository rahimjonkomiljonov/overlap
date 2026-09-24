import { describe, expect, it } from "vitest";
import { containsSensitiveContent } from "@/server/reference/sensitive";
import { VALUES_QUIZ_LENGTH } from "./schema";
import { VALUES_QUIZ_ITEMS } from "./values-quiz";

describe("VALUES_QUIZ_ITEMS", () => {
  it("has exactly the required number of items", () => {
    expect(VALUES_QUIZ_ITEMS).toHaveLength(VALUES_QUIZ_LENGTH);
  });

  it("has unique keys", () => {
    const keys = VALUES_QUIZ_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains no religion/politics/health/sex-life content (B10)", () => {
    for (const item of VALUES_QUIZ_ITEMS) {
      expect(containsSensitiveContent(item.textKo), item.textKo).toBe(false);
      expect(containsSensitiveContent(item.textEn), item.textEn).toBe(false);
    }
  });
});
