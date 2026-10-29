import type { NextResponse } from "next/server";
import * as z from "zod";
import { SLIDER_MAX, SLIDER_MIN, SLIDER_STEP, type WeightSliders } from "@/server/matching/personalize";
import type { PrivacyOverview } from "@/server/privacy/queries";
import { withdrawConsentSchema } from "@/server/privacy/schema";
import type { DeleteAccountResult, ExportDataResult, WithdrawConsentResult } from "@/server/privacy/service";
import type { SetWeightSlidersResult } from "@/server/preferences/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { readJson } from "./validate";

export const PRIVACY_READ_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
/** Building the export reads a lot of rows, so it is limited tighter than any other read. */
export const EXPORT_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
export const PRIVACY_WRITE_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };
/** Deleting is final enough that a script should not be able to hammer it. */
export const DELETE_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

function problem(result: { status: "error"; code: string }): NextResponse {
  return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
}

type Limit = { limit: (key: string) => Promise<NextResponse | null> };

// ---- overview

export type PrivacyOverviewDeps = Limit & { getOverview: (userId: string) => Promise<PrivacyOverview> };

/**
 * GET /privacy: which consents are in force (and which can be withdrawn) and the person's own request
 * history, same data as the website's /me/privacy. Open to a restricted account: privacy rights do not
 * depend on standing.
 */
export async function privacyOverviewHandler(context: MobileContext, deps: PrivacyOverviewDeps): Promise<NextResponse> {
  const limited = await deps.limit(`privacy-read:${context.actor.userId}`);
  if (limited) return limited;

  const overview = await deps.getOverview(context.actor.userId);
  return mobileJson({
    consents: overview.consents.map((c) => ({
      type: c.type,
      active: c.active,
      withdrawable: c.withdrawable,
      grantedAt: c.grantedAt?.toISOString() ?? null,
      withdrawnAt: c.withdrawnAt?.toISOString() ?? null,
    })),
    dataRequests: overview.dataRequests.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}

// ---- export

export type ExportDeps = Limit & { exportData: (person: { userId: string }) => Promise<ExportDataResult> };

/** GET /privacy/export: "download my data". Only the person's own data (see `buildUserDataExport`), and a completed ACCESS request is recorded. */
export async function exportHandler(context: MobileContext, deps: ExportDeps): Promise<NextResponse> {
  const limited = await deps.limit(`privacy-export:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.exportData({ userId: context.actor.userId });
  if (result.status === "error") return problem(result);
  return mobileJson({ data: result.data });
}

// ---- consent withdrawal

const withdrawBody = z.strictObject({ type: withdrawConsentSchema.shape.type });
export type WithdrawDeps = Limit & { withdraw: (person: { userId: string }, type: z.infer<typeof withdrawBody>["type"]) => Promise<WithdrawConsentResult> };

/**
 * POST /privacy/consents/withdraw. Only the optional types can be withdrawn (the required Terms and Privacy
 * consents end only with the account). Withdrawing the sensitive "who I'd like to meet" consent also deletes
 * that stored field at once. `422` `reason: NOT_ACTIVE` when there is nothing to withdraw.
 */
export async function withdrawConsentHandler(context: MobileContext, deps: WithdrawDeps): Promise<NextResponse> {
  const body = await readJson(context.request, withdrawBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`privacy-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.withdraw({ userId: context.actor.userId }, body.data.type);
  if (result.status === "error") return problem(result);
  return mobileJson({ status: "withdrawn", type: body.data.type });
}

// ---- account deletion

const deleteBody = z.strictObject({ confirm: z.literal(true) });
export type DeleteAccountDeps = Limit & {
  deleteAccount: (person: { userId: string }, headers: Headers) => Promise<DeleteAccountResult>;
};

/**
 * POST /privacy/delete: L2's "delete it". `{ "confirm": true }` is required so a stray call cannot delete
 * anything. Two phases on purpose: this only flips the account to DELETED, signs every session out and stamps
 * the date; the personal data is scrubbed 30 days later by the retention job.
 */
export async function deleteAccountHandler(context: MobileContext, deps: DeleteAccountDeps): Promise<NextResponse> {
  const body = await readJson(context.request, deleteBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`privacy-delete:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.deleteAccount({ userId: context.actor.userId }, context.request.headers);
  return mobileJson({ status: "deleted", purgeAfter: result.purgeAfter.toISOString() });
}

// ---- pick preferences

export type MatchingPreferencesDeps = Limit & { getSliders: (userId: string) => Promise<WeightSliders> };

/** GET /preferences/matching: the three "what matters to me" sliders and the range they accept. */
export async function matchingPreferencesHandler(context: MobileContext, deps: MatchingPreferencesDeps): Promise<NextResponse> {
  const limited = await deps.limit(`privacy-read:${context.actor.userId}`);
  if (limited) return limited;

  const sliders = await deps.getSliders(context.actor.userId);
  return mobileJson({ ...sliders, min: SLIDER_MIN, max: SLIDER_MAX, step: SLIDER_STEP });
}

const slider = z.number().min(SLIDER_MIN).max(SLIDER_MAX).multipleOf(SLIDER_STEP);
const slidersBody = z.strictObject({ classes: slider, interests: slider, freeTime: slider });
export type SetMatchingPreferencesDeps = Limit & { setSliders: (person: { userId: string }, sliders: WeightSliders) => Promise<SetWeightSlidersResult> };

/** PUT /preferences/matching: save the sliders (0.5 to 1.5 in steps of 0.25). They apply from the next daily batch. */
export async function setMatchingPreferencesHandler(context: MobileContext, deps: SetMatchingPreferencesDeps): Promise<NextResponse> {
  const body = await readJson(context.request, slidersBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`privacy-write:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.setSliders({ userId: context.actor.userId }, body.data);
  if (result.status === "error") return mobileError("RULE_VIOLATION", { reason: result.code });
  return mobileJson({ status: "saved", ...body.data });
}
