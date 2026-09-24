import type { PrismaClient } from "@/generated/prisma/client";
import { orderedPair } from "./pair";

export type FormMatchDb = Pick<PrismaClient, "wave" | "match">;

/**
 * Completes a mutual wave (REQUIREMENTS.md D2): call once the caller already knows both
 * directions of the `[fromUserId, toUserId]` pair exist (the new wave it just created or
 * is creating, plus `otherWaveId` — the other side's still-PENDING row). Marks the other
 * side MATCHED and creates the one `Match` row for this pair. The caller's own new wave
 * is expected to already have been created with `status: "MATCHED"` directly, not
 * PENDING — this only finishes the other half.
 */
export async function formMatch(
  db: FormMatchDb,
  userAId: string,
  userBId: string,
  otherWaveId: string,
): Promise<void> {
  await db.wave.update({ where: { id: otherWaveId }, data: { status: "MATCHED" } });
  const [userA, userB] = orderedPair(userAId, userBId);
  await db.match.create({ data: { userAId: userA, userBId: userB } });
}
