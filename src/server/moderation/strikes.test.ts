import { ModerationActionType } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { countPriorStrikes, suggestNextAction } from "./strikes";

describe("countPriorStrikes", () => {
  it("counts warn/suspend/ban but not dismiss or police-referral", () => {
    const count = countPriorStrikes([
      ModerationActionType.WARN,
      ModerationActionType.DISMISS,
      ModerationActionType.SUSPEND,
      ModerationActionType.POLICE_REFERRAL,
    ]);
    expect(count).toBe(2);
  });

  it("returns 0 for no actions", () => {
    expect(countPriorStrikes([])).toBe(0);
  });
});

describe("suggestNextAction", () => {
  it("suggests warn, then suspend, then ban as strikes accumulate", () => {
    expect(suggestNextAction(0)).toBe(ModerationActionType.WARN);
    expect(suggestNextAction(1)).toBe(ModerationActionType.SUSPEND);
    expect(suggestNextAction(2)).toBe(ModerationActionType.BAN);
  });

  it("stays at ban for any further strikes", () => {
    expect(suggestNextAction(5)).toBe(ModerationActionType.BAN);
  });
});
