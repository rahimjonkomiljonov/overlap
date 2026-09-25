import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { purgeSelfies } from "@/server/verification/purge";
import { deletePhoto } from "@/server/storage/photos";
import { deleteSelfie } from "@/server/storage/selfies";

/** §15.4: "30 days after unmatch or account deletion." */
export const MESSAGE_RETENTION_DAYS = 30;
/** §15.4: "90 days after closure." */
export const REPORT_EVIDENCE_RETENTION_DAYS = 90;
/** §15.4: "account life + 30 days." */
export const ACCOUNT_PURGE_GRACE_DAYS = 30;

/**
 * L3's purge log: one AuditLog row per retention pass that actually did something.
 * `actorId: null` marks it as system-initiated (never a human moderator action), the
 * same optional-actor shape AuditLog already supports for exactly this reason.
 */
async function logPurge(
  db: Pick<PrismaClient, "auditLog">,
  action: string,
  count: number,
  now: Date,
): Promise<void> {
  if (count === 0) return;
  await db.auditLog.create({
    data: { actorId: null, action, targetType: "retention_job", targetId: action, metadata: { count }, createdAt: now },
  });
}

export type MessageRetentionDb = Pick<PrismaClient, "message" | "auditLog">;

function messagePurgeWhere(cutoff: Date) {
  return {
    OR: [
      { conversation: { match: { status: "UNMATCHED" as const, unmatchedAt: { lte: cutoff } } } },
      { conversation: { match: { userA: { deletedAt: { lte: cutoff } } } } },
      { conversation: { match: { userB: { deletedAt: { lte: cutoff } } } } },
    ],
  };
}

/** Messages whose conversation is either 30+ days past unmatch, or belongs to a match where either side's account is 30+ days past deletion. */
export async function findMessagesToPurge(db: Pick<PrismaClient, "message">, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return db.message.findMany({ where: messagePurgeWhere(cutoff), select: { id: true } });
}

/** Deletes purge-eligible messages outright (nothing else references a Message by id — a Report's evidence is a snapshot, not a live FK) and logs the count. */
export async function purgeExpiredMessages(db: MessageRetentionDb, options: { now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.message.deleteMany({ where: messagePurgeWhere(cutoff) });
  await logPurge(db, "retention_purge_messages", count, now);
  return count;
}

export type ReportEvidenceRetentionDb = Pick<PrismaClient, "report" | "auditLog">;

/** Resolved reports whose evidence snapshot is 90+ days past closure and hasn't been nulled yet. */
export async function findReportsToPurgeEvidence(db: Pick<PrismaClient, "report">, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - REPORT_EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db.report.findMany({
    where: { resolvedAt: { lte: cutoff } },
    select: { id: true, evidence: true },
  });
  return candidates.filter((r) => r.evidence !== null).map((r) => ({ id: r.id }));
}

/**
 * Nulls the evidence snapshot (the raw chat-message excerpt G1 attaches at filing time)
 * on 90-day-closed reports, keeping the Report/ModerationAction rows themselves — the
 * decision, category and strike history are ordinary safety records, not the
 * confidential-communication content §15.4 specifically time-limits.
 */
export async function purgeReportEvidence(db: ReportEvidenceRetentionDb, options: { now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const toPurge = await findReportsToPurgeEvidence(db, now);
  if (toPurge.length > 0) {
    await db.report.updateMany({
      where: { id: { in: toPurge.map((r) => r.id) } },
      data: { evidence: Prisma.DbNull },
    });
  }
  await logPurge(db, "retention_purge_report_evidence", toPurge.length, now);
  return toPurge.length;
}

export type AccountPurgeDb = Pick<PrismaClient, "user" | "profile" | "selfie" | "auditLog">;

interface PurgeableAccount {
  id: string;
  photoStorageKeys: string[];
  selfieStorageKeys: string[];
}

/** DELETED accounts whose 30-day grace period has passed and haven't been physically purged yet. */
export async function findAccountsToPurge(db: Pick<PrismaClient, "user">, now: Date = new Date()): Promise<PurgeableAccount[]> {
  const cutoff = new Date(now.getTime() - ACCOUNT_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const users = await db.user.findMany({
    where: { status: "DELETED", deletedAt: { lte: cutoff }, purgedAt: null },
    select: {
      id: true,
      profile: { select: { photos: { select: { storageKey: true } } } },
      selfies: { select: { storageKey: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    photoStorageKeys: u.profile?.photos.map((p) => p.storageKey) ?? [],
    selfieStorageKeys: u.selfies.flatMap((s) => (s.storageKey ? [s.storageKey] : [])),
  }));
}

/**
 * Physically purges 30-day-past-deletion accounts (§15.4's "account life + 30 days"):
 * deletes photo/selfie storage files, deletes the Profile row (cascades to
 * ProfileCourse/Club/Spot/InterestTag/PromptAnswer/Photo), and scrubs the User row's own
 * PII (email → an obviously-synthetic placeholder, since the column is unique and
 * NOT NULL; name/image/birthYear/ageVerifiedAt → null). The row itself is never
 * deleted — Waves/Matches/Messages/Reports still reference it, the same "null the
 * identifying part, keep the row" shape as `purgeSelfies`. `purgedAt` is the
 * idempotency marker so a second run finds nothing left to do.
 */
export async function purgeDeletedAccounts(
  db: AccountPurgeDb,
  options: { now?: Date; deletePhotoFile?: (key: string) => Promise<void>; deleteSelfieFile?: (key: string) => Promise<void> } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const deletePhotoFile = options.deletePhotoFile ?? deletePhoto;
  const deleteSelfieFile = options.deleteSelfieFile ?? deleteSelfie;

  const toPurge = await findAccountsToPurge(db, now);
  for (const account of toPurge) {
    for (const key of account.photoStorageKeys) {
      await deletePhotoFile(key);
    }
    for (const key of account.selfieStorageKeys) {
      await deleteSelfieFile(key);
    }
    await db.profile.deleteMany({ where: { userId: account.id } });
    await db.selfie.updateMany({ where: { userId: account.id }, data: { storageKey: null, purgedAt: now } });
    await db.user.update({
      where: { id: account.id },
      data: {
        email: `deleted-${account.id}@purged.invalid`,
        name: "Deleted user",
        image: null,
        birthYear: null,
        ageVerifiedAt: null,
        purgedAt: now,
      },
    });
  }
  await logPurge(db, "retention_purge_accounts", toPurge.length, now);
  return toPurge.length;
}

export type RetentionJobDb = MessageRetentionDb & ReportEvidenceRetentionDb & AccountPurgeDb & Pick<PrismaClient, "selfie">;

/**
 * The one job the cron route/CLI calls: every §15.4 purge rule this codebase
 * automates, in one place. Selfie purge (7 days, A4) already existed (S08) but had
 * never been wired to a schedule — this is that schedule, alongside the three new S19
 * rules. "Expired-term data" (courses/clubs/spots/availability after term end) is
 * deliberately not included: no Campus/Term entity anywhere in this schema carries a
 * term *end date* (Course.term is just a label like "2026-2"), so there is nothing real
 * to compute a boundary from yet — flagged as a known gap, not silently dropped.
 */
export async function runRetentionJob(
  db: RetentionJobDb,
  options: { now?: Date } = {},
): Promise<{ selfies: number; messages: number; reportEvidence: number; accounts: number }> {
  const now = options.now ?? new Date();
  const selfies = await purgeSelfies(db, { now });
  const messages = await purgeExpiredMessages(db, { now });
  const reportEvidence = await purgeReportEvidence(db, { now });
  const accounts = await purgeDeletedAccounts(db, { now });
  return { selfies, messages, reportEvidence, accounts };
}
