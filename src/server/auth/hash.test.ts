import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { emailHashEquals, hashEmail, normalizeEmail } from "./hash";

describe("email hashing", () => {
  beforeEach(() => {
    process.env.EMAIL_HASH_PEPPER = randomBytes(32).toString("hex");
  });

  it("normalizes case and surrounding whitespace before hashing", () => {
    expect(hashEmail("  Minji@School.ac.kr ")).toBe(hashEmail("minji@school.ac.kr"));
  });

  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Minji@School.ac.kr ")).toBe("minji@school.ac.kr");
  });

  it("produces different hashes for different emails", () => {
    expect(hashEmail("a@school.ac.kr")).not.toBe(hashEmail("b@school.ac.kr"));
  });

  it("is deterministic for the same email and pepper", () => {
    expect(hashEmail("stable@school.ac.kr")).toBe(hashEmail("stable@school.ac.kr"));
  });

  it("changes if the pepper changes (so a leaked hash table isn't portable)", () => {
    const first = hashEmail("someone@school.ac.kr");
    process.env.EMAIL_HASH_PEPPER = randomBytes(32).toString("hex");
    expect(hashEmail("someone@school.ac.kr")).not.toBe(first);
  });

  it("emailHashEquals confirms a matching hash and rejects a non-matching one", () => {
    const hash = hashEmail("check@school.ac.kr");
    expect(emailHashEquals("check@school.ac.kr", hash)).toBe(true);
    expect(emailHashEquals("other@school.ac.kr", hash)).toBe(false);
  });

  it("throws a clear error when the pepper is missing", () => {
    delete process.env.EMAIL_HASH_PEPPER;
    expect(() => hashEmail("x@school.ac.kr")).toThrow(/EMAIL_HASH_PEPPER/);
  });

  it("throws a clear error when the pepper is too short", () => {
    process.env.EMAIL_HASH_PEPPER = "short";
    expect(() => hashEmail("x@school.ac.kr")).toThrow(/EMAIL_HASH_PEPPER/);
  });
});
