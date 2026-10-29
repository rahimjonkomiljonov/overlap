import type { PrismaClient } from "@/generated/prisma/client";
import { ConsentType, DataRequestType, UserStatus } from "@/generated/prisma/enums";
import { withdrawConsent } from "@/server/consent/consent";
import { createDataRequest } from "./data-requests";
import { buildUserDataExport } from "./export";
import { ACCOUNT_PURGE_GRACE_DAYS } from "./retention";

export type WithdrawConsentDb = Pick<PrismaClient, "consent" | "profile" | "dataRequest">;

export type WithdrawConsentResult = { status: "withdrawn" } | { status: "error"; code: "NOT_ACTIVE" };

/**
 * L1's "withdrawable any time". Withdrawing `SENSITIVE_PREFERENCE` also immediately nulls
 * `Profile.interestedIn` (BUILD_PLAN S19: "deletes the encrypted field") rather than waiting for a
 * later retention pass: it is the one consent whose data has nowhere else to live once permission
 * for it is gone. Shared by the website's `withdrawConsentAction` and the mobile route.
 */
export async function withdrawConsentStep(
  db: WithdrawConsentDb,
  person: { userId: string },
  type: keyof typeof ConsentType,
  now: Date = new Date(),
): Promise<WithdrawConsentResult> {
  const consentType = ConsentType[type];
  const withdrew = await withdrawConsent(db, person.userId, consentType, now);
  if (!withdrew) return { status: "error", code: "NOT_ACTIVE" };

  if (consentType === ConsentType.SENSITIVE_PREFERENCE) {
    await db.profile.updateMany({ where: { userId: person.userId }, data: { interestedIn: null } });
  }
  await createDataRequest(db, person.userId, DataRequestType.WITHDRAWAL, { now });
  return { status: "withdrawn" };
}

export type DeleteAccountDb = Pick<PrismaClient, "user" | "pushSubscription" | "dataRequest">;

export type DeleteAccountResult = { status: "deleted"; purgeAfter: Date };

/**
 * L2's "delete it", in two phases on purpose. This completes the *request* immediately by flipping
 * the account to DELETED and signing every session out (so the account stops being usable and stops
 * appearing to anyone else, since candidate selection already excludes non-ACTIVE statuses), and it
 * only stamps `deletedAt` and removes device push registrations. It never touches personal data.
 * The actual scrub happens `ACCOUNT_PURGE_GRACE_DAYS` later in `purgeDeletedAccounts`, never
 * synchronously here: the grace period is the whole point of the retention rule. `signOut` is
 * injected because the website and the apps revoke sessions from different request shapes.
 */
export async function requestAccountDeletionStep(
  db: DeleteAccountDb,
  person: { userId: string },
  deps: { signOut: () => Promise<void> },
  now: Date = new Date(),
): Promise<DeleteAccountResult> {
  await db.user.update({ where: { id: person.userId }, data: { status: UserStatus.DELETED, deletedAt: now } });
  await db.pushSubscription.deleteMany({ where: { userId: person.userId } });
  await createDataRequest(db, person.userId, DataRequestType.DELETION, { now });
  await deps.signOut();
  return { status: "deleted", purgeAfter: new Date(now.getTime() + ACCOUNT_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000) };
}

export type ExportDataDb = Pick<PrismaClient, "user" | "dataRequest">;

export type ExportDataResult = { status: "ready"; data: NonNullable<Awaited<ReturnType<typeof buildUserDataExport>>> } | { status: "error"; code: "NOT_FOUND" };

/** L2's "download my data": the person's own data and nobody else's, and a completed ACCESS request on record. Shared by the website's download and the mobile route. */
export async function exportMyDataStep(db: ExportDataDb, person: { userId: string }): Promise<ExportDataResult> {
  const data = await buildUserDataExport(db, person.userId);
  if (!data) return { status: "error", code: "NOT_FOUND" };
  await createDataRequest(db, person.userId, DataRequestType.ACCESS);
  return { status: "ready", data };
}
