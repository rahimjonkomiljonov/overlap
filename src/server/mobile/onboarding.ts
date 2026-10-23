import * as z from "zod";
import type { NextResponse } from "next/server";
import type { AccountSetupInput, AccountSetupResult } from "@/server/auth/account-setup";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { readJson } from "./validate";

/** The age the service is for. Shown by the app; the check itself is the age verifier's. */
export const MINIMUM_AGE = 19;

/** Ten attempts per 15 minutes per person: enough for typos, too few to guess invite codes. */
export const ONBOARDING_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

/**
 * The body of POST /onboarding/account. Strict, so unexpected fields are refused. The birth month
 * and day are used for the age check only; they are never stored or logged (see age-verifier.ts).
 * Terms and age are literal `true`: the app must show them as an explicit tick, never pre-ticked.
 * The sensitive consent is a plain yes/no, and no is a valid answer.
 */
export const accountSetupBody = z.strictObject({
  birthYear: z.number().int().min(1900).max(2100),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  attestedAdult: z.literal(true),
  termsAccepted: z.literal(true),
  sensitivePreference: z.boolean(),
  inviteCode: z.string().trim().max(32).optional(),
});

/** GET /onboarding: what the app needs to draw the setup screens. */
export function onboardingInfo(context: MobileContext, cohortRelease: boolean): NextResponse {
  return mobileJson({
    accountSetupComplete: context.actor.campusId !== "",
    inviteCodeRequired: cohortRelease,
    minimumAge: MINIMUM_AGE,
  });
}

export type AccountSetupDeps = {
  /** The shared setup (src/server/auth/account-setup.ts), already bound to the real database. */
  complete: (input: AccountSetupInput) => Promise<AccountSetupResult>;
  /** Null to carry on, or the 429 to send. */
  limit: (key: string) => Promise<NextResponse | null>;
};

/**
 * POST /onboarding/account: finish account setup from the app. Same rules as the website, because
 * both call completeAccountSetup. Calling it again after setup is finished changes nothing.
 */
export async function accountSetupHandler(
  context: MobileContext,
  deps: AccountSetupDeps,
): Promise<NextResponse> {
  const limited = await deps.limit(`onboarding:${context.actor.userId}`);
  if (limited) return limited;

  if (context.actor.campusId !== "")
    return mobileJson({ status: "complete", alreadyComplete: true });

  const body = await readJson(context.request, accountSetupBody);
  if (!body.ok) return body.response;

  const result = await deps.complete({
    userId: context.actor.userId,
    birthYear: body.data.birthYear,
    birthMonth: body.data.birthMonth,
    birthDay: body.data.birthDay,
    attestedAdult: body.data.attestedAdult,
    sensitiveGranted: body.data.sensitivePreference,
    inviteCode: body.data.inviteCode || undefined,
    source: "mobile-onboarding",
  });
  if (result.status === "error") return mobileError("RULE_VIOLATION", { reason: result.code });
  return mobileJson({ status: "complete", datingAvailable: result.datingAvailable });
}
