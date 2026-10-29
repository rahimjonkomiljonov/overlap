"use server";

import { signOutEverywhere } from "@/server/auth/actions";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { withdrawConsentSchema } from "@/server/privacy/schema";
import { requestAccountDeletionStep, withdrawConsentStep } from "@/server/privacy/service";

export type WithdrawConsentState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/**
 * L1's "withdrawable any time". Withdrawing `SENSITIVE_PREFERENCE` also immediately
 * nulls `Profile.interestedIn` (BUILD_PLAN S19: "deletes the encrypted field") rather
 * than waiting for a later retention pass — it's the one consent whose data has nowhere
 * else to live once permission for it is gone, unlike e.g. a marketing opt-out which
 * has no associated stored payload to remove.
 */
export async function withdrawConsentAction(
  _prev: WithdrawConsentState,
  formData: FormData,
): Promise<WithdrawConsentState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = withdrawConsentSchema.safeParse({ type: formData.get("type") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await withdrawConsentStep(prisma, { userId: actor.userId }, parsed.data.type);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

export type RequestAccountDeletionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * L2's "delete it": completes the *request* immediately (well within L2's 10-day
 * deadline) by flipping the account to DELETED and signing every session out — the
 * account stops being usable and stops appearing to anyone else (candidates.ts already
 * excludes non-ACTIVE statuses) right away. The actual PII scrub happens 30 days later,
 * via `src/server/privacy/retention.ts`'s `purgeDeletedAccounts` — §15.4's "account
 * life + 30 days" — never synchronously in this action. The caller (a client component)
 * navigates to /login itself once this returns success — the same
 * state-reacts-then-navigates pattern LoginForm/MatchCard already use — since this
 * "use server" action has no request-scoped locale of its own to build a locale-aware
 * redirect href from.
 */
export async function requestAccountDeletion(
  _prev: RequestAccountDeletionState,
  _formData: FormData,
): Promise<RequestAccountDeletionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  await requestAccountDeletionStep(prisma, { userId: actor.userId }, { signOut: signOutEverywhere });
  return { status: "success" };
}
