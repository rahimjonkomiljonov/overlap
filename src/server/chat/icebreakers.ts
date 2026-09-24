import type { PrismaClient } from "@/generated/prisma/client";
import type { Explanation } from "@/server/matching/explain";

export type IcebreakerDb = Pick<PrismaClient, "conversation" | "wave">;

/**
 * The shared-overlap "reasons" behind whichever of the pair's two `Wave` rows was sent
 * from a real pick (D4: icebreakers use shared overlap elements) — reuses S10's
 * `Explanation` type as-is, resolved by the caller with `src/server/picks/reasons.ts`'s
 * `buildLabelMaps`/`resolveReasons` exactly like a pick card's "why you overlap" reasons,
 * rather than duplicating that resolution logic here. Returns `[]` (not a fallback
 * template) when neither wave has a `BatchItem` — both sides waved from the S14 inbox,
 * with no shared-overlap data attached to either — the caller falls back to generic
 * conversation starters in that case.
 */
export async function getIcebreakerReasons(db: IcebreakerDb, conversationId: string): Promise<Explanation[]> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      match: {
        select: {
          userAId: true,
          userBId: true,
        },
      },
    },
  });
  if (!conversation) return [];

  const { userAId, userBId } = conversation.match;

  // Either direction of the pair's Wave(s) could be the one that came from a real pick
  // (has a BatchItem) — checked in a fixed order (A→B then B→A) for determinism.
  const waves = await db.wave.findMany({
    where: {
      OR: [
        { fromUserId: userAId, toUserId: userBId },
        { fromUserId: userBId, toUserId: userAId },
      ],
    },
    select: { fromUserId: true, toUserId: true, batchItem: { select: { reasons: true } } },
  });

  const withReasons = waves.find((w) => w.fromUserId === userAId && w.batchItem) ?? waves.find((w) => w.batchItem);
  if (!withReasons?.batchItem) return [];

  return (withReasons.batchItem.reasons as unknown as Explanation[]).slice(0, 3);
}
