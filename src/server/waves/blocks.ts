import type { PrismaClient } from "@/generated/prisma/client";

export type BlockCheckDb = Pick<PrismaClient, "block">;

/**
 * Whether either user has blocked the other, in either direction. The matching engine
 * (S10) already excludes blocked pairs from ever appearing in a batch together, but a
 * wave can also be sent directly — from the S14 waves inbox in response to an incoming
 * one, or from a `BatchItem` composed before a block was created — so every wave-sending
 * action re-checks this itself rather than trusting the candidate pool alone.
 */
export async function isBlockedEitherWay(db: BlockCheckDb, userAId: string, userBId: string): Promise<boolean> {
  const block = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId },
      ],
    },
    select: { id: true },
  });
  return block !== null;
}
