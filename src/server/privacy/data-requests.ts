import type { DataRequestType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

export type DataRequestDb = Pick<PrismaClient, "dataRequest">;

/** L2: "confirm; 10 days" — the statutory response deadline. */
export const DATA_REQUEST_RESPONSE_DAYS = 10;

/**
 * Logs a privacy-center request (L2). Every request this codebase can fulfil is
 * self-service and resolves in the same call that creates it — `completeImmediately`
 * defaults to that — but the row (and `dueAt`) still exist so a future request type
 * routed to a human has somewhere to sit PENDING and something to be checked against.
 */
export async function createDataRequest(
  db: DataRequestDb,
  userId: string,
  type: DataRequestType,
  options: { completeImmediately?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const complete = options.completeImmediately ?? true;
  const dueAt = new Date(now.getTime() + DATA_REQUEST_RESPONSE_DAYS * 24 * 60 * 60 * 1000);
  return db.dataRequest.create({
    data: {
      userId,
      type,
      dueAt,
      status: complete ? "COMPLETED" : "PENDING",
      completedAt: complete ? now : null,
    },
  });
}
