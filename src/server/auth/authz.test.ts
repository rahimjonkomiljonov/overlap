import { describe, expect, it } from "vitest";
import { UserStatus } from "@/generated/prisma/enums";
import { type Actor, AuthError, can, isRestricted, Role, requireRole, requireUser } from "./authz";

function actor(overrides: Partial<NonNullable<Actor>> = {}): Actor {
  return {
    userId: "u1",
    campusId: "c1",
    role: Role.USER,
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
    expect(() => requireRole(actor({ role: Role.MODERATOR }), Role.MODERATOR)).not.toThrow();
    expect(() => requireRole(actor({ role: Role.ADMIN }), Role.MODERATOR)).not.toThrow();
  });

  it("throws FORBIDDEN for a role below the required rank", () => {
    try {
      requireRole(actor({ role: Role.USER }), Role.MODERATOR);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).code).toBe("FORBIDDEN");
    }
  });

  it("still checks authentication first", () => {
    try {
      requireRole(null, Role.USER);
      expect.unreachable();
    } catch (e) {
      expect((e as AuthError).code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("can", () => {
  it("returns true/false instead of throwing", () => {
    expect(can(actor({ role: Role.ADMIN }), Role.MODERATOR)).toBe(true);
    expect(can(actor({ role: Role.USER }), Role.MODERATOR)).toBe(false);
    expect(can(null, Role.USER)).toBe(false);
  });
});

describe("isRestricted", () => {
  const actorWith = (status: UserStatus): Actor => ({ userId: "u", campusId: "c", role: Role.USER, status });

  it("is true only for suspended and banned accounts", () => {
    expect(isRestricted(actorWith(UserStatus.SUSPENDED))).toBe(true);
    expect(isRestricted(actorWith(UserStatus.BANNED))).toBe(true);
    expect(isRestricted(actorWith(UserStatus.ACTIVE))).toBe(false);
    // Pausing is the user's own choice, not a restriction.
    expect(isRestricted(actorWith(UserStatus.PAUSED))).toBe(false);
    expect(isRestricted(null)).toBe(false);
  });
});
