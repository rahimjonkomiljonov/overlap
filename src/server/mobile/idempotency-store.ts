import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  KEY_RETENTION_MS,
  STALE_CLAIM_MS,
  type ClaimInput,
  type IdempotencyStore,
  type StoredKey,
} from "./idempotency";

export type IdempotencyDb = Pick<PrismaClient, "idempotencyKey">;

/** The table-backed store (`idempotency_keys`). The first writer of a (user, key) pair wins; the database's primary key decides races. */
export function prismaIdempotencyStore(
  db: IdempotencyDb,
  now: () => Date = () => new Date(),
): IdempotencyStore {
  const toStored = (row: {
    route: string;
    requestHash: string;
    status: number;
    response: unknown;
  }): StoredKey => ({
    route: row.route,
    requestHash: row.requestHash,
    status: row.status,
    response: row.response,
  });

  async function tryCreate(input: ClaimInput): Promise<boolean> {
    try {
      await db.idempotencyKey.create({
        data: {
          userId: input.userId,
          key: input.key,
          route: input.route,
          requestHash: input.requestHash,
          createdAt: now(),
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return false;
      throw error;
    }
  }

  return {
    async claim(input) {
      if (await tryCreate(input)) return { claimed: true };
      let existing = await db.idempotencyKey.findUnique({
        where: { userId_key: { userId: input.userId, key: input.key } },
      });
      // A claim that never finished (the server died mid-request) must not block this key for a day.
      if (
        existing &&
        existing.status === 0 &&
        now().getTime() - existing.createdAt.getTime() > STALE_CLAIM_MS
      ) {
        await db.idempotencyKey.deleteMany({
          where: { userId: input.userId, key: input.key, status: 0, createdAt: existing.createdAt },
        });
        if (await tryCreate(input)) return { claimed: true };
        existing = await db.idempotencyKey.findUnique({
          where: { userId_key: { userId: input.userId, key: input.key } },
        });
      }
      // Gone again between the two reads: someone else is working on it right now.
      return {
        claimed: false,
        existing: existing
          ? toStored(existing)
          : { route: input.route, requestHash: input.requestHash, status: 0, response: null },
      };
    },
    async complete(userId, key, status, response) {
      await db.idempotencyKey.update({
        where: { userId_key: { userId, key } },
        data: {
          status,
          response:
            response === null || response === undefined
              ? Prisma.DbNull
              : (response as Prisma.InputJsonValue),
        },
      });
    },
    async release(userId, key) {
      await db.idempotencyKey.deleteMany({ where: { userId, key } });
    },
  };
}

/** Forgets keys older than a day. Run from the daily retention job. Returns how many were removed. */
export async function purgeIdempotencyKeys(
  db: IdempotencyDb,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await db.idempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - KEY_RETENTION_MS) } },
  });
  return count;
}
