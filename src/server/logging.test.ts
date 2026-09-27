import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureError } from "./logging";

describe("captureError", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("never lets sensitive fields in `extra` reach the logged output (CLAUDE.md's hard rule)", () => {
    captureError("test-context", new Error("boom"), {
      interestedIn: "men",
      message: "hey, want to meet at the library?",
      selfieUrl: "https://example.com/selfie.jpg",
      userId: "u1",
    });

    const loggedArgs = consoleSpy.mock.calls[0];
    const serialized = JSON.stringify(loggedArgs);
    expect(serialized).not.toContain("men");
    expect(serialized).not.toContain("library");
    expect(serialized).not.toContain("selfie.jpg");
    // Non-sensitive context still comes through, so the log stays useful.
    expect(serialized).toContain("u1");
  });

  it("still logs a plain, useful error message and context tag when there is no extra", () => {
    captureError("session.touchLastActiveAt", new Error("connection refused"));
    const [tag, message] = consoleSpy.mock.calls[0];
    expect(tag).toBe("[session.touchLastActiveAt] connection refused");
    expect(message).toMatchObject({ extra: undefined });
  });

  it("handles a non-Error thrown value without crashing", () => {
    captureError("test-context", "a plain string was thrown");
    const [tag] = consoleSpy.mock.calls[0];
    expect(tag).toBe("[test-context] a plain string was thrown");
  });
});
