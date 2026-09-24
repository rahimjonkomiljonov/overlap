import { VerificationDecision } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { deleteSelfie } from "@/server/storage/selfies";

/** Selfie deleted within 7 days of the decision (A4/REQUIREMENTS.md §15.4). */
export const SELFIE_RETENTION_DAYS = 7;

export type PurgeDb = Pick<PrismaClient, "selfie">;
type PurgeableSelfie = { id: string; storageKey: string | null };

/** Decided selfies past the retention window whose image hasn't been purged yet. */
export async function findSelfiesToPurge(
  db: PurgeDb,
  now: Date = new Date(),
): Promise<PurgeableSelfie[]> {
  const cutoff = new Date(now.getTime() - SELFIE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return db.selfie.findMany({
    where: {
      decision: { in: [VerificationDecision.APPROVED, VerificationDecision.REJECTED] },
      decidedAt: { lte: cutoff },
      storageKey: { not: null },
    },
    select: { id: true, storageKey: true },
  });
}

/**
 * Deletes the underlying image for every purge-eligible selfie and clears
 * `storageKey`, keeping the row itself (decision, reason, timestamps) for the audit
 * trail. `deleteFile` is injectable so this stays testable without touching real
 * storage — see purge.test.ts.
 */
export async function purgeSelfies(
  db: PurgeDb,
  options: { now?: Date; deleteFile?: (storageKey: string) => Promise<void> } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const deleteFile = options.deleteFile ?? deleteSelfie;

  const toPurge = await findSelfiesToPurge(db, now);
  for (const selfie of toPurge) {
    if (selfie.storageKey) {
      await deleteFile(selfie.storageKey);
    }
    await db.selfie.update({
      where: { id: selfie.id },
      data: { storageKey: null, purgedAt: now },
    });
  }
  return toPurge.length;
}
