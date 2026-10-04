import { describe, expect, it } from "vitest";
import { IntentMode } from "@/generated/prisma/enums";
import { compatiblePocketIntents } from "./rules";

const { FRIENDS, STUDY, DATING, OPEN } = IntentMode;

describe("compatiblePocketIntents", () => {
  it("returns the shared pocket intents", () => {
    expect(compatiblePocketIntents([FRIENDS, STUDY], [STUDY])).toEqual([STUDY]);
  });

  it("never matches on Dating, even when both want it", () => {
    expect(compatiblePocketIntents([DATING], [DATING])).toEqual([]);
    expect(compatiblePocketIntents([DATING, FRIENDS], [DATING, STUDY])).toEqual([]);
  });

  it("treats Open as fitting any pocket intent on the other side", () => {
    expect(compatiblePocketIntents([OPEN], [STUDY, DATING])).toEqual([STUDY]);
    expect(compatiblePocketIntents([FRIENDS], [OPEN])).toEqual([FRIENDS]);
  });

  it("is empty when either side has no pocket intent", () => {
    expect(compatiblePocketIntents([], [FRIENDS])).toEqual([]);
    expect(compatiblePocketIntents([OPEN], [DATING])).toEqual([]);
  });

  it("is symmetric in which intents fit", () => {
    const pairs: [IntentMode[], IntentMode[]][] = [
      [[FRIENDS, STUDY], [STUDY, OPEN]],
      [[OPEN], [OPEN, DATING]],
      [[FRIENDS], [STUDY]],
    ];
    for (const [a, b] of pairs) {
      expect(new Set(compatiblePocketIntents(a, b)).size > 0).toBe(
        new Set(compatiblePocketIntents(b, a)).size > 0,
      );
    }
  });
});
