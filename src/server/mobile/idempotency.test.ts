import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { Role, UserStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/server/auth/authz";
import {
  IDEMPOTENCY_HEADER,
  KEY_RETENTION_MS,
  STALE_CLAIM_MS,
  withIdempotency,
  type ClaimInput,
  type IdempotencyStore,
  type StoredKey,
} from "./idempotency";
import {
  prismaIdempotencyStore,
  purgeIdempotencyKeys,
  type IdempotencyDb,
} from "./idempotency-store";
import { mobileJson } from "./responses";

const actor = (userId = "user-a"): NonNullable<Actor> => ({
  userId,
  campusId: "c1",
  role: Role.USER,
  status: UserStatus.ACTIVE,
});
const KEY = "0b5f2c1e-7a9d-4f10-8c2e-1d3a5b7c9e11";
function request(body: unknown, key: string | null = KEY) {
  return new Request("https://overlaps.tech/api/mobile/v1/waves", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(key ? { [IDEMPOTENCY_HEADER]: key } : {}) },
  });
}

/** A store that lives in a Map, behaving like the table: the first claim of a (user, key) wins. */
function memoryStore() {
  const rows = new Map<string, StoredKey>();
  const id = (userId: string, key: string) => `${userId}:${key}`;
  const store: IdempotencyStore = {
    async claim(input: ClaimInput) {
      const existing = rows.get(id(input.userId, input.key));
      if (existing) return { claimed: false, existing };
      rows.set(id(input.userId, input.key), {
        route: input.route,
        requestHash: input.requestHash,
        status: 0,
        response: null,
      });
      return { claimed: true };
    },
    async complete(userId, key, status, response) {
      const row = rows.get(id(userId, key))!;
      row.status = status;
      row.response = response;
    },
    async release(userId, key) {
      rows.delete(id(userId, key));
    },
  };
  return { store, rows };
}

describe("withIdempotency", () => {
  it("runs the handler once and gives a retry the same answer without running it again", async () => {
    const { store } = memoryStore();
    const handler = vi.fn(async () => mobileJson({ waveId: "w1" }, { status: 201 }));
    const route = withIdempotency("waves.send", handler, store);

    const first = await route({ actor: actor(), request: request({ to: "u2" }) });
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replay")).toBeNull();

    const retry = await route({ actor: actor(), request: request({ to: "u2" }) });
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual({ waveId: "w1" });
    expect(retry.headers.get("idempotent-replay")).toBe("true");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("requires a well-formed key", async () => {
    const { store } = memoryStore();
    const handler = vi.fn(async () => mobileJson({}));
    const route = withIdempotency("waves.send", handler, store);
    for (const key of [null, "", "short", "has spaces in it!!", "x".repeat(65)]) {
      const response = await route({ actor: actor(), request: request({ to: "u2" }, key) });
      expect(response.status).toBe(400);
      expect((await response.json()).fields[0].name).toBe("Idempotency-Key");
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses the same key with a different body, or on a different route (422)", async () => {
    const { store } = memoryStore();
    const handler = vi.fn(async () => mobileJson({ ok: true }));
    await withIdempotency(
      "waves.send",
      handler,
      store,
    )({ actor: actor(), request: request({ to: "u2" }) });

    const otherBody = await withIdempotency(
      "waves.send",
      handler,
      store,
    )({ actor: actor(), request: request({ to: "u3" }) });
    expect(otherBody.status).toBe(422);
    expect(await otherBody.json()).toEqual({ error: "IDEMPOTENCY_KEY_REUSED" });

    const otherRoute = await withIdempotency(
      "messages.send",
      handler,
      store,
    )({ actor: actor(), request: request({ to: "u2" }) });
    expect(otherRoute.status).toBe(422);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("answers 409 while the first request is still running, without running the handler twice", async () => {
    const { store } = memoryStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const handler = vi.fn(async () => {
      await gate;
      return mobileJson({ ok: true });
    });
    const route = withIdempotency("waves.send", handler, store);
    const first = route({ actor: actor(), request: request({ to: "u2" }) });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const second = await route({ actor: actor(), request: request({ to: "u2" }) });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "REQUEST_IN_PROGRESS" });
    release();
    expect((await first).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps each person's keys separate", async () => {
    const { store } = memoryStore();
    const handler = vi.fn(async () => mobileJson({ ok: true }));
    const route = withIdempotency("waves.send", handler, store);
    await route({ actor: actor("user-a"), request: request({ to: "u9" }) });
    const other = await route({ actor: actor("user-b"), request: request({ to: "u9" }) });
    expect(other.headers.get("idempotent-replay")).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("remembers client errors (a replay gives the same refusal) but not server errors or rate limits", async () => {
    for (const [status, remembered] of [
      [400, true],
      [404, true],
      [409, true],
      [429, false],
      [500, false],
      [503, false],
    ] as const) {
      const { store, rows } = memoryStore();
      const handler = vi.fn(async () => NextResponse.json({ error: "X" }, { status }));
      const route = withIdempotency("waves.send", handler, store);
      await route({ actor: actor(), request: request({ to: "u2" }) });
      await route({ actor: actor(), request: request({ to: "u2" }) });
      expect(handler).toHaveBeenCalledTimes(remembered ? 1 : 2);
      expect(rows.size).toBe(remembered ? 1 : 0);
    }
  });

  it("frees the key when the handler throws, so the retry can run", async () => {
    const { store, rows } = memoryStore();
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(mobileJson({ ok: true }));
    const route = withIdempotency("waves.send", handler, store);
    await expect(route({ actor: actor(), request: request({ to: "u2" }) })).rejects.toThrow("boom");
    expect(rows.size).toBe(0);
    const retry = await route({ actor: actor(), request: request({ to: "u2" }) });
    expect(retry.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
// The table-backed store, against a fake table that enforces the (userId, key) primary key.

type Row = {
  userId: string;
  key: string;
  route: string;
  requestHash: string;
  status: number;
  response: unknown;
  createdAt: Date;
};
function fakeTable() {
  const rows = new Map<string, Row>();
  const id = (userId: string, key: string) => `${userId}:${key}`;
  const db = {
    idempotencyKey: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            key: string;
            route: string;
            requestHash: string;
            createdAt: Date;
          };
        }) => {
          if (rows.has(id(data.userId, data.key)))
            throw new Prisma.PrismaClientKnownRequestError("duplicate", {
              code: "P2002",
              clientVersion: "test",
            });
          const row: Row = { ...data, status: 0, response: null };
          rows.set(id(data.userId, data.key), row);
          return row;
        },
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { userId_key: { userId: string; key: string } } }) =>
          rows.get(id(where.userId_key.userId, where.userId_key.key)) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId_key: { userId: string; key: string } };
          data: { status: number; response: unknown };
        }) => {
          const row = rows.get(id(where.userId_key.userId, where.userId_key.key))!;
          row.status = data.status;
          row.response = data.response;
          return row;
        },
      ),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId?: string;
            key?: string;
            status?: number;
            createdAt?: Date | { lt: Date };
          };
        }) => {
          let count = 0;
          for (const [k, row] of [...rows]) {
            const matches =
              (where.userId === undefined || row.userId === where.userId) &&
              (where.key === undefined || row.key === where.key) &&
              (where.status === undefined || row.status === where.status) &&
              (where.createdAt === undefined ||
                (where.createdAt instanceof Date
                  ? row.createdAt.getTime() === where.createdAt.getTime()
                  : row.createdAt < where.createdAt.lt));
            if (matches) {
              rows.delete(k);
              count++;
            }
          }
          return { count };
        },
      ),
    },
  } as unknown as IdempotencyDb;
  return { db, rows };
}
const input: ClaimInput = { userId: "user-a", key: KEY, route: "waves.send", requestHash: "h1" };

describe("prismaIdempotencyStore", () => {
  it("the first claim wins and a second sees what is there", async () => {
    const { db } = fakeTable();
    const store = prismaIdempotencyStore(db);
    expect(await store.claim(input)).toEqual({ claimed: true });
    const second = await store.claim(input);
    expect(second).toEqual({
      claimed: false,
      existing: { route: "waves.send", requestHash: "h1", status: 0, response: null },
    });
  });

  it("stores the answer, which a later claim then returns", async () => {
    const { db } = fakeTable();
    const store = prismaIdempotencyStore(db);
    await store.claim(input);
    await store.complete("user-a", KEY, 201, { waveId: "w1" });
    expect(await store.claim(input)).toEqual({
      claimed: false,
      existing: { route: "waves.send", requestHash: "h1", status: 201, response: { waveId: "w1" } },
    });
  });

  it("release forgets the claim", async () => {
    const { db, rows } = fakeTable();
    const store = prismaIdempotencyStore(db);
    await store.claim(input);
    await store.release("user-a", KEY);
    expect(rows.size).toBe(0);
    expect(await store.claim(input)).toEqual({ claimed: true });
  });

  it("takes over a claim that never finished once it is stale, but not before", async () => {
    const { db } = fakeTable();
    let clock = new Date("2026-10-24T12:00:00Z");
    const store = prismaIdempotencyStore(db, () => clock);
    await store.claim(input); // a request that then crashed
    clock = new Date(clock.getTime() + STALE_CLAIM_MS - 1000);
    expect((await store.claim(input)).claimed).toBe(false); // still might be running
    clock = new Date(clock.getTime() + 2000);
    expect(await store.claim(input)).toEqual({ claimed: true });
  });

  it("never takes over a finished claim, however old", async () => {
    const { db } = fakeTable();
    let clock = new Date("2026-10-24T12:00:00Z");
    const store = prismaIdempotencyStore(db, () => clock);
    await store.claim(input);
    await store.complete("user-a", KEY, 200, { ok: true });
    clock = new Date(clock.getTime() + STALE_CLAIM_MS * 10);
    expect((await store.claim(input)).claimed).toBe(false);
  });

  it("lets two different people use the same key text", async () => {
    const { db } = fakeTable();
    const store = prismaIdempotencyStore(db);
    expect(await store.claim(input)).toEqual({ claimed: true });
    expect(await store.claim({ ...input, userId: "user-b" })).toEqual({ claimed: true });
  });
});

describe("purgeIdempotencyKeys", () => {
  it("removes keys older than a day and keeps newer ones", async () => {
    const { db, rows } = fakeTable();
    const now = new Date("2026-10-24T12:00:00Z");
    for (const [key, ageMs] of [
      ["old-key-0001", KEY_RETENTION_MS + 1000],
      ["new-key-0001", KEY_RETENTION_MS - 1000],
    ] as const) {
      await db.idempotencyKey.create({
        data: {
          userId: "user-a",
          key,
          route: "r",
          requestHash: "h",
          createdAt: new Date(now.getTime() - ageMs),
        },
      });
    }
    expect(await purgeIdempotencyKeys(db, now)).toBe(1);
    expect([...rows.values()].map((r) => r.key)).toEqual(["new-key-0001"]);
  });
});
