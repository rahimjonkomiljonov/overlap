import { describe, expect, it } from "vitest";
import { containsSensitiveContent, findSensitiveKeywords } from "./sensitive";

describe("containsSensitiveContent", () => {
  it("flags religion", () => {
    expect(containsSensitiveContent("기독교 학생회")).toBe(true);
    expect(containsSensitiveContent("Christian Fellowship")).toBe(true);
  });

  it("flags politics", () => {
    expect(containsSensitiveContent("정치외교학회 정당 모임")).toBe(true);
  });

  it("flags health/disability", () => {
    expect(containsSensitiveContent("장애인 인권 동아리")).toBe(true);
  });

  it("flags sexual orientation", () => {
    expect(containsSensitiveContent("성소수자 동아리")).toBe(true);
    expect(containsSensitiveContent("LGBT support group")).toBe(true);
  });

  it("flags labor unions", () => {
    expect(containsSensitiveContent("대학원생 노동조합")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsSensitiveContent("CHURCH group")).toBe(true);
  });

  it("does not flag ordinary hobby clubs", () => {
    expect(containsSensitiveContent("사진동아리 빛")).toBe(false);
    expect(containsSensitiveContent("Basketball Club")).toBe(false);
    expect(containsSensitiveContent("보드게임 동아리")).toBe(false);
  });
});

describe("findSensitiveKeywords", () => {
  it("returns the matched keyword(s)", () => {
    expect(findSensitiveKeywords("기독교 동아리")).toContain("기독교");
  });

  it("returns an empty array for clean text", () => {
    expect(findSensitiveKeywords("등산 동아리 오름")).toEqual([]);
  });
});
