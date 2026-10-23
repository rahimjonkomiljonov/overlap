import type { PrismaClient } from "@/generated/prisma/client";
import { ConsentType } from "@/generated/prisma/enums";
import { getDatingStatus, redeemInviteCode } from "@/server/cohorts/release";
import { recordConsent } from "@/server/consent/consent";
import type { AgeVerificationReason, AgeVerifier } from "./age-verifier";
import { resolveCampusForEmail } from "./campus";

/**
 * Finishing account setup: the campus, the age check, the Terms and Privacy consents, the optional
 * sensitive consent and (when cohort release is on) the invite code. The website's onboarding
 * action and the mobile API both call this, so the two can never apply different rules.
 *
 * Declining the sensitive consent never blocks the account: it is recorded as a decline and only
 * Dating mode stays off (REQUIREMENTS.md B2).
 */
export type AccountSetupInput = {
  userId: string;
  birthYear: number;
  /** Used for the age check only. Never stored, never logged (see age-verifier.ts). */
  birthMonth: number;
  birthDay: number;
  attestedAdult: boolean;
  /** The "who I'd like to meet" consent. Optional and separate from the Terms. */
  sensitiveGranted: boolean;
  /** Required exactly when cohort release is on. */
  inviteCode?: string;
  /** Where the consent was given, kept in the consent ledger: "onboarding" (web) or "mobile-onboarding". */
  source: string;
};

export type AccountSetupFailure = "INVALID_DOMAIN" | "INVALID_INVITE" | AgeVerificationReason;
export type AccountSetupResult =
  { status: "complete"; datingAvailable: boolean } | { status: "error"; code: AccountSetupFailure };

export type AccountSetupDeps = {
  db: PrismaClient;
  verifier: AgeVerifier;
  cohortRelease: boolean;
};

class InvalidInviteError extends Error {}

export async function completeAccountSetup(
  deps: AccountSetupDeps,
  input: AccountSetupInput,
): Promise<AccountSetupResult> {
  const { db, verifier, cohortRelease } = deps;

  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  const campus = await resolveCampusForEmail(db, user.email);
  if (!campus) {
    // Shouldn't happen (the domain was checked at sign-in), but never leave an account set up
    // against no campus at all.
    return { status: "error", code: "INVALID_DOMAIN" };
  }

  const age = verifier.verify({
    birthYear: input.birthYear,
    birthMonth: input.birthMonth,
    birthDay: input.birthDay,
    attestedAdult: input.attestedAdult,
  });
  if (!age.eligible) return { status: "error", code: age.reason };

  if (cohortRelease && !input.inviteCode) return { status: "error", code: "INVALID_INVITE" };

  try {
    await db.$transaction(async (tx) => {
      // Redeemed first and in the same transaction: a bad code leaves the account exactly as it
      // was, with no consents recorded and no campus set.
      if (cohortRelease) {
        const redeemed = await redeemInviteCode(tx, {
          userId: input.userId,
          campusId: campus.id,
          code: input.inviteCode!,
        });
        if (!redeemed) throw new InvalidInviteError();
      }
      await tx.user.update({
        where: { id: input.userId },
        data: { campusId: campus.id, birthYear: input.birthYear, ageVerifiedAt: age.verifiedAt },
      });
      await recordConsent(tx, {
        userId: input.userId,
        type: ConsentType.TERMS,
        granted: true,
        source: input.source,
      });
      await recordConsent(tx, {
        userId: input.userId,
        type: ConsentType.PRIVACY_POLICY,
        granted: true,
        source: input.source,
      });
      await recordConsent(tx, {
        userId: input.userId,
        type: ConsentType.SENSITIVE_PREFERENCE,
        granted: input.sensitiveGranted,
        source: input.source,
      });
    });
  } catch (error) {
    if (error instanceof InvalidInviteError) return { status: "error", code: "INVALID_INVITE" };
    throw error;
  }

  const datingStatus = await getDatingStatus(db, input.userId, { cohortRelease });
  return { status: "complete", datingAvailable: datingStatus === "available" };
}
