import { describe, expect, it } from "vitest";
import {
  MAX_COURSES,
  MAX_FREE_TIME_SLOT,
  MAX_INTERESTS,
  PROMPT_ANSWER_MAX_LENGTH,
  REQUIRED_PROMPT_COUNT,
  VALUES_QUIZ_LENGTH,
  basicsSchema,
  coursesSchema,
  freeTimeSchema,
  intentsSchema,
  interestsSchema,
  promptsSchema,
  valuesQuizSchema,
} from "./schema";

describe("basicsSchema", () => {
  it("accepts a minimal valid submission", () => {
    const result = basicsSchema.safeParse({
      firstName: "지민",
      gender: "WOMAN",
      pronouns: "",
      year: "2",
      major: "컴퓨터공학",
      interestedIn: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty first name", () => {
    const result = basicsSchema.safeParse({
      firstName: "",
      gender: "WOMAN",
      year: "2",
      major: "컴퓨터공학",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid gender value", () => {
    const result = basicsSchema.safeParse({
      firstName: "지민",
      gender: "SOMETHING_ELSE",
      year: "2",
      major: "컴퓨터공학",
    });
    expect(result.success).toBe(false);
  });
});

describe("intentsSchema", () => {
  it("requires at least one intent", () => {
    expect(intentsSchema.safeParse({ intents: [] }).success).toBe(false);
    expect(intentsSchema.safeParse({ intents: ["FRIENDS"] }).success).toBe(true);
  });

  it("rejects an unknown intent value", () => {
    expect(intentsSchema.safeParse({ intents: ["NOT_A_MODE"] }).success).toBe(false);
  });
});

describe("coursesSchema", () => {
  it(`caps at ${MAX_COURSES} courses`, () => {
    const tooMany = Array.from({ length: MAX_COURSES + 1 }, (_, i) => `course-${i}`);
    expect(coursesSchema.safeParse({ courseIds: tooMany }).success).toBe(false);
    expect(coursesSchema.safeParse({ courseIds: tooMany.slice(0, MAX_COURSES) }).success).toBe(true);
  });

  it("allows zero courses (optional step)", () => {
    expect(coursesSchema.safeParse({ courseIds: [] }).success).toBe(true);
  });
});

describe("freeTimeSchema", () => {
  it("accepts slots within range and rejects out-of-range slots", () => {
    expect(freeTimeSchema.safeParse({ slots: ["0", String(MAX_FREE_TIME_SLOT)] }).success).toBe(true);
    expect(freeTimeSchema.safeParse({ slots: [String(MAX_FREE_TIME_SLOT + 1)] }).success).toBe(false);
    expect(freeTimeSchema.safeParse({ slots: ["-1"] }).success).toBe(false);
  });
});

describe("interestsSchema", () => {
  it(`caps taxonomy picks at ${MAX_INTERESTS}`, () => {
    const tooMany = Array.from({ length: MAX_INTERESTS + 1 }, (_, i) => `tag-${i}`);
    expect(interestsSchema.safeParse({ interestTagIds: tooMany, freeText: [] }).success).toBe(false);
  });

  it("defaults freeText to an empty array when omitted", () => {
    const result = interestsSchema.safeParse({ interestTagIds: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.freeText).toEqual([]);
  });
});

describe("promptsSchema", () => {
  it(`requires exactly ${REQUIRED_PROMPT_COUNT} prompt/answer pairs`, () => {
    const tooFew = { promptIds: ["p1", "p2"], answers: ["a1", "a2"] };
    expect(promptsSchema.safeParse(tooFew).success).toBe(false);

    const justRight = { promptIds: ["p1", "p2", "p3"], answers: ["a1", "a2", "a3"] };
    expect(promptsSchema.safeParse(justRight).success).toBe(true);
  });

  it(`rejects an answer over ${PROMPT_ANSWER_MAX_LENGTH} characters`, () => {
    const tooLong = {
      promptIds: ["p1", "p2", "p3"],
      answers: ["a".repeat(PROMPT_ANSWER_MAX_LENGTH + 1), "a2", "a3"],
    };
    expect(promptsSchema.safeParse(tooLong).success).toBe(false);
  });

  it("rejects an empty answer", () => {
    const empty = { promptIds: ["p1", "p2", "p3"], answers: ["", "a2", "a3"] };
    expect(promptsSchema.safeParse(empty).success).toBe(false);
  });
});

describe("valuesQuizSchema", () => {
  it(`requires exactly ${VALUES_QUIZ_LENGTH} answers in range 1-5`, () => {
    const tooFew = { answers: Array(VALUES_QUIZ_LENGTH - 1).fill("3") };
    expect(valuesQuizSchema.safeParse(tooFew).success).toBe(false);

    const justRight = { answers: Array(VALUES_QUIZ_LENGTH).fill("3") };
    expect(valuesQuizSchema.safeParse(justRight).success).toBe(true);

    const outOfRange = Array(VALUES_QUIZ_LENGTH).fill("3");
    outOfRange[0] = "6";
    expect(valuesQuizSchema.safeParse({ answers: outOfRange }).success).toBe(false);
  });
});
