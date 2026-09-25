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

/**
 * Every user id that has blocked, or been blocked by, `userId` — one bulk query, for
 * queries.ts's `getIncomingWaves`/`getMatches`/chat's `getConversationForActor` to filter
 * against in memory, rather than an N+1 `isBlockedEitherWay` call per row. G2's "mutual
 * invisibility" applies even to an already-formed match/conversation: blocking someone
 * after matching must remove them from both sides' waves/matches/chat, not just future
 * picks (which src/server/matching/candidates.ts already excludes at composition time).
 */
export async function getBlockedUserIdSet(db: BlockCheckDb, userId: string): Promise<ReadonlySet<string>> {
  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
}
