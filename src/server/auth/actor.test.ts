import { describe, expect, it, vi } from "vitest";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { ACTIVITY_TOUCH_THROTTLE_MS, resolveActor, type ActorDb } from "./actor";

const NOW = new Date("2026-10-24T12:00:00Z");

type Row = {
  campusId: string | null;
  status: UserStatus;
  suspendedUntil: Date | null;
  trustScore: number;
  role: Role;
  lastActiveAt: Date;
};
const baseRow: Row = { campusId: "campus-1", status: UserStatus.ACTIVE, suspendedUntil: null, trustScore: 50, role: Role.USER, lastActiveAt: NOW };

function fakeDb(row: Row | null) {
  const update = vi.fn(async () => ({}));
  const findUnique = vi.fn(async () => row);
  return { db: { user: { findUnique, update } } as unknown as ActorDb, update, findUnique };
}
const signedInAs = (id: string) => async () => ({ user: { id } });

describe("resolveActor", () => {
  it("returns null with no session (missing or expired: Better Auth reports both as no session)", async () => {
    const { db, findUnique } = fakeDb(baseRow);
    expect(await resolveActor(async () => null, db, NOW)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled(); // never touches the database without a session
  });

  it("returns null when the session's user no longer exists", async () => {
    const { db } = fakeDb(null);
    expect(await resolveActor(signedInAs("ghost"), db, NOW)).toBeNull();
  });

  it("reads the user the session names, and nobody else", async () => {
    const { db, findUnique } = fakeDb(baseRow);
    const actor = await resolveActor(signedInAs("user-a"), db, NOW);
    expect(actor).toEqual({ userId: "user-a", campusId: "campus-1", role: Role.USER, status: UserStatus.ACTIVE });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-a" } }));
  });

  it("reports an unfinished account (no campus yet) with an empty campus id", async () => {
    const { db } = fakeDb({ ...baseRow, campusId: null });
    expect((await resolveActor(signedInAs("u"), db, NOW))?.campusId).toBe("");
  });

  it("passes the account's status through so callers can refuse restricted accounts", async () => {
    for (const status of [UserStatus.PAUSED, UserStatus.BANNED, UserStatus.DELETED]) {
      const { db } = fakeDb({ ...baseRow, status });
      expect((await resolveActor(signedInAs("u"), db, NOW))?.status).toBe(status);
    }
  });

  it("lifts a suspension once it has ended, but never a ban", async () => {
    const ended = fakeDb({ ...baseRow, status: UserStatus.SUSPENDED, suspendedUntil: new Date(NOW.getTime() - 1000) });
    expect((await resolveActor(signedInAs("u"), ended.db, NOW))?.status).toBe(UserStatus.ACTIVE);
    expect(ended.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { status: UserStatus.ACTIVE, suspendedUntil: null } });

    const running = fakeDb({ ...baseRow, status: UserStatus.SUSPENDED, suspendedUntil: new Date(NOW.getTime() + 60_000) });
    expect((await resolveActor(signedInAs("u"), running.db, NOW))?.status).toBe(UserStatus.SUSPENDED);

    const banned = fakeDb({ ...baseRow, status: UserStatus.BANNED, suspendedUntil: new Date(NOW.getTime() - 1000) });
    expect((await resolveActor(signedInAs("u"), banned.db, NOW))?.status).toBe(UserStatus.BANNED);
    expect(banned.update).not.toHaveBeenCalled();
  });

  it("records activity at most once an hour", async () => {
    const fresh = fakeDb({ ...baseRow, lastActiveAt: new Date(NOW.getTime() - ACTIVITY_TOUCH_THROTTLE_MS + 1000) });
    await resolveActor(signedInAs("u"), fresh.db, NOW);
    expect(fresh.update).not.toHaveBeenCalled();

    const stale = fakeDb({ ...baseRow, lastActiveAt: new Date(NOW.getTime() - ACTIVITY_TOUCH_THROTTLE_MS - 1000) });
    await resolveActor(signedInAs("u"), stale.db, NOW);
    expect(stale.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { lastActiveAt: NOW } });
  });
});
