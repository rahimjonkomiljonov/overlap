import { describe, expect, it } from "vitest";
import { MAJOR_GROUPS, isKnownMajor, majorLabel } from "./majors";

describe("majorLabel", () => {
  it("shows English names in the English app and the stored name otherwise", () => {
    expect(majorLabel("컴퓨터공학과", "en")).toBe("Computer Engineering");
    expect(majorLabel("컴퓨터공학과", "ko")).toBe("컴퓨터공학과");
    expect(majorLabel("기타", "en")).toBe("Other");
  });

  it("labels the English-track programmes by their plain subject name", () => {
    expect(majorLabel("컴퓨터공학과 (영어 트랙)", "en")).toBe("Computer Engineering");
    expect(majorLabel("경영학과 (영어 트랙)", "en")).toBe("Business Administration");
  });

  it("shows a value that is not on the list exactly as typed (older profiles)", () => {
    expect(majorLabel("Computer Engineering", "en")).toBe("Computer Engineering");
    expect(majorLabel("컴퓨터공학", "en")).toBe("컴퓨터공학");
  });
});

describe("MAJOR_GROUPS", () => {
  it("lists the English track first, with exactly its two majors", () => {
    expect(MAJOR_GROUPS[0].college.en).toBe("English track");
    expect(MAJOR_GROUPS[0].majors.map((m) => m.en)).toEqual(["Computer Engineering", "Business Administration"]);
  });

  it("has no duplicate stored names, and every name is accepted", () => {
    const stored = MAJOR_GROUPS.flatMap((g) => g.majors.map((m) => m.ko));
    expect(new Set(stored).size).toBe(stored.length);
    for (const name of stored) expect(isKnownMajor(name)).toBe(true);
  });
});
