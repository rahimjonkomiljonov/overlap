import { Gender, IntentMode } from "@/generated/prisma/enums";
import { describe, expect, it } from "vitest";
import { passesGenderFilter } from "./filters";

describe("passesGenderFilter", () => {
  it("never excludes anyone for Friends, Study, or Open — regardless of interestedIn/gender", () => {
    const viewer = { gender: Gender.MAN, interestedIn: [Gender.MAN] };
    const candidate = { gender: Gender.WOMAN, interestedIn: [Gender.WOMAN] };
    for (const intent of [IntentMode.FRIENDS, IntentMode.STUDY, IntentMode.OPEN]) {
      expect(passesGenderFilter(intent, viewer, candidate)).toBe(true);
    }
  });

  it("for Dating, requires mutual fit: each side's interestedIn must include the other's gender", () => {
    const a = { gender: Gender.WOMAN, interestedIn: [Gender.MAN] };
    const b = { gender: Gender.MAN, interestedIn: [Gender.WOMAN] };
    expect(passesGenderFilter(IntentMode.DATING, a, b)).toBe(true);
    expect(passesGenderFilter(IntentMode.DATING, b, a)).toBe(true);
  });

  it("for Dating, excludes when only one side's preference matches", () => {
    const viewer = { gender: Gender.WOMAN, interestedIn: [Gender.MAN] };
    // candidate is a man who is not interested in women.
    const candidate = { gender: Gender.MAN, interestedIn: [Gender.MAN] };
    expect(passesGenderFilter(IntentMode.DATING, viewer, candidate)).toBe(false);
  });

  it("for Dating, fails closed when interestedIn is missing on either side", () => {
    const withPreference = { gender: Gender.WOMAN, interestedIn: [Gender.MAN] };
    const withoutPreference = { gender: Gender.MAN, interestedIn: null };
    expect(passesGenderFilter(IntentMode.DATING, withPreference, withoutPreference)).toBe(false);
    expect(passesGenderFilter(IntentMode.DATING, withoutPreference, withPreference)).toBe(false);
  });

  it("supports multi-gender preferences (e.g. interested in more than one gender)", () => {
    const viewer = { gender: Gender.NONBINARY, interestedIn: [Gender.MAN, Gender.WOMAN, Gender.NONBINARY] };
    const candidate = { gender: Gender.NONBINARY, interestedIn: [Gender.NONBINARY] };
    expect(passesGenderFilter(IntentMode.DATING, viewer, candidate)).toBe(true);
  });
});
