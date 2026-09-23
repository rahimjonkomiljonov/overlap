import { describe, expect, it } from "vitest";
import { UserStatus } from "@/generated/prisma/enums";
import { type Actor, AuthError, can, requireRole, requireUser } from "./authz";

function actor(overrides: Partial<NonNullable<Actor>> = {}): Actor {
  return {
    userId: "u1",
    campusId: "c1",
    role: "user",
    status: UserStatus.ACTIVE,
    ...overrides,
  };
}

describe("requireUser", () => {
  it("passes for a signed-in, active actor", () => {
    expect(() => requireUser(actor())).not.toThrow();
  });

  it("throws UNAUTHENTICATED for null", () => {
    expect(() => requireUser(null)).toThrow(AuthError);
    try {
      requireUser(null);
    } catch (e) {
      expect((e as AuthError).code).toBe("UNAUTHENTICATED");
    }
  });

  it.each([UserStatus.PAUSED, UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.DELETED])(
    "throws ACCOUNT_RESTRICTED for status %s",
    (status) => {
      try {
        requireUser(actor({ status }));
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).code).toBe("ACCOUNT_RESTRICTED");
      }
    },
  );
});

describe("requireRole", () => {
  it("allows a role at or above the required rank", () => {
    expect(() => requireRole(actor({ role: "moderator" }), "moderator")).not.toThrow();
    expect(() => requireRole(actor({ role: "admin" }), "moderator")).not.toThrow();
  });

  it("throws FORBIDDEN for a role below the required rank", () => {
    try {
      requireRole(actor({ role: "user" }), "moderator");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).code).toBe("FORBIDDEN");
    }
  });

  it("still checks authentication first", () => {
    try {
      requireRole(null, "user");
      expect.unreachable();
    } catch (e) {
      expect((e as AuthError).code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("can", () => {
  it("returns true/false instead of throwing", () => {
    expect(can(actor({ role: "admin" }), "moderator")).toBe(true);
    expect(can(actor({ role: "user" }), "moderator")).toBe(false);
    expect(can(null, "user")).toBe(false);
  });
});
