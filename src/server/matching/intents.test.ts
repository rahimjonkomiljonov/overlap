import { describe, expect, it } from "vitest";
import { IntentMode } from "@/generated/prisma/enums";
import { effectiveIntents, intentPoolFilter } from "./intents";

const { FRIENDS, STUDY, DATING, OPEN } = IntentMode;

describe("effectiveIntents", () => {
  it("leaves explicit modes alone", () => {
    expect(effectiveIntents([FRIENDS, STUDY], { hasDatingPreference: false })).toEqual([FRIENDS, STUDY]);
  });

  it("puts Open into Friends and Study, but not Dating without a stored preference", () => {
    expect(effectiveIntents([OPEN], { hasDatingPreference: false })).toEqual([FRIENDS, STUDY]);
  });

  it("puts Open into Dating too once the person has a stored preference (so the consent is given)", () => {
    expect(effectiveIntents([OPEN], { hasDatingPreference: true })).toEqual([FRIENDS, STUDY, DATING]);
  });

  it("never invents an Open pool, and de-duplicates when Open is combined with other modes", () => {
    expect(effectiveIntents([OPEN, FRIENDS], { hasDatingPreference: false })).toEqual([FRIENDS, STUDY]);
    expect(effectiveIntents([OPEN], { hasDatingPreference: true })).not.toContain(OPEN);
  });

  it("keeps an explicit Dating choice regardless", () => {
    expect(effectiveIntents([DATING], { hasDatingPreference: false })).toEqual([DATING]);
  });
});

describe("intentPoolFilter", () => {
  it("lets Open people into the Friends and Study pools", () => {
    expect(intentPoolFilter(FRIENDS)).toEqual({ OR: [{ intents: { has: FRIENDS } }, { intents: { has: OPEN } }] });
  });

  it("lets Open people into Dating only with a stored preference", () => {
    expect(intentPoolFilter(DATING)).toEqual({
      OR: [{ intents: { has: DATING } }, { intents: { has: OPEN }, interestedIn: { not: null } }],
    });
  });
});
