import { describe, expect, it } from "vitest";
import { UserStatus } from "@/generated/prisma/enums";
import { checkLiftSuspension } from "./suspensions";

describe("checkLiftSuspension", () => {
  it("allows lifting a suspended account that is someone else's", () => {
    expect(checkLiftSuspension({ actorId: "mod", targetId: "user", targetStatus: UserStatus.SUSPENDED })).toEqual({ ok: true });
  });

  it("never lets a moderator lift their own suspension", () => {
    expect(checkLiftSuspension({ actorId: "mod", targetId: "mod", targetStatus: UserStatus.SUSPENDED })).toEqual({
      ok: false,
      code: "OWN_ACCOUNT",
    });
  });

  it("leaves bans, deleted, paused and active accounts alone", () => {
    for (const status of [UserStatus.BANNED, UserStatus.DELETED, UserStatus.PAUSED, UserStatus.ACTIVE, null]) {
      expect(checkLiftSuspension({ actorId: "mod", targetId: "user", targetStatus: status })).toEqual({
        ok: false,
        code: "NOT_SUSPENDED",
      });
    }
  });
});
