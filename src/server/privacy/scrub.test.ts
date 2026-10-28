import { describe, expect, it } from "vitest";
import { scrub } from "./scrub";

describe("scrub", () => {
  it("redacts the dating-specific fields named in the hard rule", () => {
    const result = scrub({
      interestedIn: "men",
      selfieUrl: "https://example.com/selfie.jpg",
      message: "hey, want to meet at the library?",
      name: "Minji",
    });
    expect(result).toEqual({
      interestedIn: "[REDACTED]",
      selfieUrl: "[REDACTED]",
      message: "[REDACTED]",
      name: "Minji",
    });
  });

  it("redacts a real Message-row-shaped payload (M09: chat text must never be logged)", () => {
    const result = scrub({
      id: "msg-1",
      senderId: "user-a",
      text: "meet me outside the library at 7?",
      createdAt: new Date("2026-10-28T00:00:00Z"),
    });
    expect(result).toEqual({
      id: "msg-1",
      senderId: "user-a",
      text: "[REDACTED]",
      createdAt: new Date("2026-10-28T00:00:00Z"),
    });
  });

  it("matches key names case-insensitively and across snake_case/camelCase", () => {
    const result = scrub({ Interested_In: "women", ChatText: "hi" });
    expect(result).toEqual({ Interested_In: "[REDACTED]", ChatText: "[REDACTED]" });
  });

  it("redacts nested objects and arrays", () => {
    const result = scrub({
      user: { profile: { interestedIn: "everyone" } },
      messages: [{ content: "secret" }, { content: "another secret" }],
    });
    expect(result).toEqual({
      user: { profile: { interestedIn: "[REDACTED]" } },
      messages: "[REDACTED]",
    });
  });

  it("redacts generic credential-shaped keys as a safety net", () => {
    const result = scrub({ password: "hunter2", apiKey: "sk-123", other: "fine" });
    expect(result).toEqual({ password: "[REDACTED]", apiKey: "[REDACTED]", other: "fine" });
  });

  it("accepts extra caller-supplied sensitive keys without losing the defaults", () => {
    const result = scrub({ birthCertificateNumber: "123", selfie: "x" }, [
      "birthCertificateNumber",
    ]);
    expect(result).toEqual({ birthCertificateNumber: "[REDACTED]", selfie: "[REDACTED]" });
  });

  it("leaves non-sensitive data, dates and primitives untouched", () => {
    const date = new Date("2026-09-23T00:00:00Z");
    const result = scrub({ id: 1, active: true, createdAt: date, tags: ["a", "b"] });
    expect(result).toEqual({ id: 1, active: true, createdAt: date, tags: ["a", "b"] });
  });

  it("does not mutate the input", () => {
    const input = { message: "secret" };
    scrub(input);
    expect(input.message).toBe("secret");
  });

  it("survives a circular reference instead of hanging or crashing", () => {
    const input: Record<string, unknown> = { message: "secret" };
    input.self = input;
    const result = scrub(input) as Record<string, unknown>;
    expect(result.message).toBe("[REDACTED]");
    expect(result.self).toBe("[CIRCULAR]");
  });
});
