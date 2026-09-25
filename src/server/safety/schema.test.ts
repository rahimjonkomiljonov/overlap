import { describe, expect, it } from "vitest";
import {
  blockUserSchema,
  hideByClubSchema,
  hideByCourseSchema,
  hideByEmailSchema,
  setIncognitoSchema,
  setPausedSchema,
  unblockUserSchema,
  unhideSchema,
} from "./schema";

describe("hide schemas", () => {
  it("require a non-empty id", () => {
    expect(hideByCourseSchema.safeParse({ courseId: "" }).success).toBe(false);
    expect(hideByClubSchema.safeParse({ clubId: "" }).success).toBe(false);
    expect(unhideSchema.safeParse({ hiddenUserId: "" }).success).toBe(false);
  });

  it("hideByEmail normalizes case and trims", () => {
    const result = hideByEmailSchema.safeParse({ email: "  Test@Example.com  " });
    expect(result.success && result.data.email).toBe("test@example.com");
  });

  it("hideByEmail rejects a non-email string", () => {
    expect(hideByEmailSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("block schemas", () => {
  it("require a target user id", () => {
    expect(blockUserSchema.safeParse({ targetUserId: "" }).success).toBe(false);
    expect(unblockUserSchema.safeParse({ targetUserId: "" }).success).toBe(false);
  });

  it("accepts an optional reason", () => {
    expect(blockUserSchema.safeParse({ targetUserId: "u1" }).success).toBe(true);
    expect(blockUserSchema.safeParse({ targetUserId: "u1", reason: "harassment" }).success).toBe(true);
  });
});

describe("toggle schemas", () => {
  it("only accept the literal strings \"true\"/\"false\"", () => {
    expect(setPausedSchema.safeParse({ paused: "true" }).success).toBe(true);
    expect(setPausedSchema.safeParse({ paused: "false" }).success).toBe(true);
    expect(setPausedSchema.safeParse({ paused: "yes" }).success).toBe(false);
    expect(setIncognitoSchema.safeParse({ incognito: "true" }).success).toBe(true);
    expect(setIncognitoSchema.safeParse({ incognito: "1" }).success).toBe(false);
  });
});
