import { describe, expect, it } from "vitest";
import { en } from "../../../mobile/src/lib/strings.en";
import { ko } from "../../../mobile/src/lib/strings.ko";

/** Texts that are the same in both languages on purpose (an example address, a sample code, a file name, a brand). */
const SAME_ON_PURPOSE = new Set(["emailPlaceholder", "codePlaceholder", "privacyDataFileName"]);

type Leaf = { path: string; value: unknown };

function leaves(value: unknown, path: string, out: Leaf[] = []): Leaf[] {
  if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  else out.push({ path, value });
  return out;
}

const enLeaves = leaves(en, "");
const koLeaves = leaves(ko, "");
const koByPath = new Map(koLeaves.map((l) => [l.path, l.value]));

/** The text a function entry gives for sample arguments (numbers read fine wherever a name, date or count goes). */
function render(fn: unknown): string {
  const f = fn as (...args: unknown[]) => unknown;
  return String(f(...[1, 2, 3].slice(0, f.length)));
}

describe("mobile strings: Korean and English (BUILD_PLAN M15c)", () => {
  it("have exactly the same entries, in the same shape", () => {
    expect(koLeaves.map((l) => l.path).sort()).toEqual(enLeaves.map((l) => l.path).sort());
    for (const { path, value } of enLeaves) expect(typeof koByPath.get(path)).toBe(typeof value);
  });

  it("have no empty text in either language", () => {
    for (const { path, value } of [...enLeaves, ...koLeaves]) {
      if (typeof value === "string") expect(value.trim().length, path).toBeGreaterThan(0);
    }
  });

  it("give sensible text from every template function (no 'undefined' or 'NaN') in both languages", () => {
    for (const { path, value } of [...enLeaves, ...koLeaves.map((l) => ({ ...l, path: `ko:${l.path}` }))]) {
      if (typeof value !== "function") continue;
      const text = render(value);
      expect(text.trim().length, path).toBeGreaterThan(0);
      expect(text, path).not.toMatch(/undefined|NaN/);
    }
  });

  it("keep a template's numbers and names in the Korean text, not just the English", () => {
    const keepsArgs = (fn: unknown) => {
      const f = fn as (...a: unknown[]) => unknown;
      const sample = ["AAA", "BBB", "CCC"].slice(0, f.length);
      return sample.every((s) => String(f(...sample)).includes(s));
    };
    const dateOrCount = new Set(["dateLabel", "clockLabel", "yearName", "pocketMemberCount", "safetyHidCount", "pocketAlsoShared", "verifyRejected"]);
    for (const { path, value } of koLeaves) {
      if (typeof value === "function" && !dateOrCount.has(path)) expect(keepsArgs(value), path).toBe(true);
    }
  });

  it("are really translated: every Korean text contains Hangul, except the ones that are the same on purpose", () => {
    for (const { path, value } of koLeaves) {
      if (typeof value !== "string") continue;
      const english = enLeaves.find((l) => l.path === path)?.value;
      if (SAME_ON_PURPOSE.has(path)) continue;
      expect(value, path).toMatch(/[가-힣]/);
      expect(value, path).not.toBe(english);
    }
  });

  it("format dates and clocks in each language's own way", () => {
    expect(en.dateLabel(2, 9, 28)).toBe("Wed, Oct 28");
    expect(ko.dateLabel(2, 9, 28)).toBe("10월 28일 (수)");
    expect(en.clockLabel(20, 5)).toBe("8:05pm");
    expect(ko.clockLabel(20, 5)).toBe("오후 8:05");
    expect(en.clockLabel(0, 0)).toBe("12:00am");
    expect(ko.clockLabel(0, 0)).toBe("오전 12:00");
  });
});
