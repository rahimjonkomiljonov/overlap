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
 * Dating mode needs the sensitive "who I'd like to meet" consent (REQUIREMENTS.md B2):
 * declining it never blocks account creation, only this one mode. No Preference row
 * exists yet (S07) — this checks only whether the consent itself was ever granted.
 */
export async function canUseDatingMode(db: ConsentDb, userId: string): Promise<boolean> {
  const latest = await getLatestConsent(db, userId, ConsentType.SENSITIVE_PREFERENCE);
  return latest?.granted === true;
}
