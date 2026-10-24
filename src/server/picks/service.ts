import type { PrismaClient } from "@/generated/prisma/client";

export type PassPickDb = Pick<PrismaClient, "batchItem">;

export type PassPickResult =
  { status: "passed" } | { status: "error"; code: "NOT_FOUND" | "ALREADY_DECIDED" };

/**
 * Passes on one of the caller's own picks. Shared by the website's `passPick` action and the mobile
 * `POST /picks/{id}/pass` route, so both apply the same rules: the pick must belong to the caller
 * (someone else's looks exactly like one that does not exist) and must still be undecided. A passed
 * pick is never listed again (`getPicksForActor` only returns undecided items); after a second
 * pass of the same person the matching code never offers them again (C8).
 */
export async function passPickStep(
  db: PassPickDb,
  person: { userId: string },
  batchItemId: string,
  now: Date = new Date(),
): Promise<PassPickResult> {
  const item = await db.batchItem.findUnique({
    where: { id: batchItemId },
    select: { id: true, decision: true, dailyBatch: { select: { userId: true } } },
  });
  if (!item || item.dailyBatch.userId !== person.userId) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (item.decision !== null) {
    return { status: "error", code: "ALREADY_DECIDED" };
  }
  await db.batchItem.update({
    where: { id: item.id },
    data: { decision: "PASSED", decidedAt: now },
  });
  return { status: "passed" };
}
