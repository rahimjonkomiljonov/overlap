import type { PrismaClient } from "@/generated/prisma/client";
import { computeTrustScore, NO_SIGNALS } from "./score";
import { loadTrustSignals, type TrustSignalsDb } from "./signals";

/**
 * Writes today's G10 score into `User.trustScore` for every non-deleted user on a campus,
 * from the daily batch cron. One update per distinct score value, not per user, since
 * scores are coarse (multiples of 5). Matching never reads this column: it recomputes
 * live, so the snapshot only has to be fresh enough for an admin to read.
 */
export async function refreshTrustSnapshots(
  db: Pick<PrismaClient, "user"> & TrustSignalsDb,
  campusId: string,
  now: Date = new Date(),
): Promise<number> {
  const users = await db.user.findMany({
    where: { campusId, status: { not: "DELETED" } },
    select: { id: true, trustScore: true },
  });
  const signals = await loadTrustSignals(
    db,
    users.map((u) => u.id),
    now,
  );

  const byScore = new Map<number, string[]>();
  for (const user of users) {
    const score = computeTrustScore(signals.get(user.id) ?? NO_SIGNALS);
    if (score === user.trustScore) continue;
    if (!byScore.has(score)) byScore.set(score, []);
    byScore.get(score)!.push(user.id);
  }

  let changed = 0;
  for (const [score, ids] of byScore) {
    const result = await db.user.updateMany({ where: { id: { in: ids } }, data: { trustScore: score } });
    changed += result.count;
  }
  return changed;
}
