import type { PrismaClient } from "@/generated/prisma/client";
import { enqueueNotification } from "@/server/notifications/queue";
import { orderedPair } from "./pair";

export type FormMatchDb = Pick<PrismaClient, "wave" | "match" | "conversation" | "notification">;

/**
 * Completes a mutual wave (REQUIREMENTS.md D2): call once the caller already knows both
 * directions of the `[fromUserId, toUserId]` pair exist (the new wave it just created or
 * is creating, plus `otherWaveId` — the other side's still-PENDING row). Marks the other
 * side MATCHED, creates the one `Match` row for this pair, and creates its `Conversation`
 * (S15) in the same call — every match always has somewhere to chat from the moment it
 * forms, never a later backfill step. The caller's own new wave is expected to already
 * have been created with `status: "MATCHED"` directly, not PENDING — this only finishes
 * the other half. Also queues a MATCH notification for both users (S18) — the single
 * hook point regardless of whether the mutual wave completed via `sendWave` or
 * `waveBack`.
 */
export async function formMatch(
  db: FormMatchDb,
  userAId: string,
  userBId: string,
  otherWaveId: string,
): Promise<void> {
  await db.wave.update({ where: { id: otherWaveId }, data: { status: "MATCHED" } });
  const [userA, userB] = orderedPair(userAId, userBId);
  const match = await db.match.create({ data: { userAId: userA, userBId: userB } });
  await db.conversation.create({ data: { matchId: match.id } });
  await enqueueNotification(db, { userId: userA, type: "MATCH", dedupeKey: `match:${match.id}:${userA}` });
  await enqueueNotification(db, { userId: userB, type: "MATCH", dedupeKey: `match:${match.id}:${userB}` });
}
