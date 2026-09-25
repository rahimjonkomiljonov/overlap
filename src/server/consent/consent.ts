import { ConsentType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Consent ledger (L1): append-only and versioned. A new consent record is always
 * INSERTed, never updated in place — re-consenting (e.g. after policy text changes)
 * adds a new row rather than overwriting history, so "what did this user agree to,
 * and when" stays answerable later. Both grants and explicit declines are recorded.
 */

export type ConsentDb = Pick<PrismaClient, "consent">;

/** Bump when Terms/Privacy copy changes. S13 (legal drafts) will own real versioning. */
export const POLICY_VERSION = "2026-09-23-draft";

export async function recordConsent(
  db: ConsentDb,
  input: {
    userId: string;
    type: ConsentType;
    granted: boolean;
    source: string;
    policyVersion?: string;
  },
) {
  return db.consent.create({
    data: {
      userId: input.userId,
      type: input.type,
      granted: input.granted,
      policyVersion: input.policyVersion ?? POLICY_VERSION,
      source: input.source,
    },
  });
}

/** The most recent record for a user/type — "latest wins" for any current-state check. */
export async function getLatestConsent(db: ConsentDb, userId: string, type: ConsentType) {
  return db.consent.findFirst({
    where: { userId, type },
    orderBy: { grantedAt: "desc" },
  });
}

/**
 * Whether a consent is currently in force: the latest record was a grant, and it was
 * never later withdrawn (L1: "withdrawable any time"). Withdrawal (S19,
 * `withdrawConsent`) sets `withdrawnAt` on the granted row itself rather than inserting
 * a fresh decline — a later re-consent still inserts a new row, which naturally becomes
 * the latest and has its own, unset `withdrawnAt`.
 */
export async function hasActiveConsent(db: ConsentDb, userId: string, type: ConsentType): Promise<boolean> {
  const latest = await getLatestConsent(db, userId, type);
  return latest?.granted === true && latest.withdrawnAt === null;
}

/**
 * Dating mode needs the sensitive "who I'd like to meet" consent (REQUIREMENTS.md B2):
 * declining or withdrawing it never blocks account creation, only this one mode.
 */
export async function canUseDatingMode(db: ConsentDb, userId: string): Promise<boolean> {
  return hasActiveConsent(db, userId, ConsentType.SENSITIVE_PREFERENCE);
}

/**
 * L1's "withdrawable any time": marks the latest active grant for `type` as withdrawn.
 * A no-op (returns false) if there is no active grant to withdraw — withdrawing
 * something never granted, or already withdrawn, isn't an error, just nothing to do.
 * Never touches TERMS/PRIVACY_POLICY (required-to-use-service consents aren't
 * withdrawable without deleting the account itself); callers only offer this for the
 * optional/sensitive types (§15.3).
 */
export async function withdrawConsent(db: ConsentDb, userId: string, type: ConsentType, now: Date = new Date()): Promise<boolean> {
  const latest = await getLatestConsent(db, userId, type);
  if (!latest || latest.granted !== true || latest.withdrawnAt !== null) {
    return false;
  }
  await db.consent.update({ where: { id: latest.id }, data: { withdrawnAt: now } });
  return true;
}
