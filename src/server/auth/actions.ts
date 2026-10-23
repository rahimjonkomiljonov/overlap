"use server";

import { headers } from "next/headers";
import { isCohortReleaseEnabled } from "@/server/cohorts/release";
import { prisma } from "@/server/db";
import { completeAccountSetup } from "./account-setup";
import { auth } from "./auth";
import { getActiveAgeVerifier } from "./age-verifier";
import { resolveCampusForEmail } from "./campus";
import { normalizeEmail } from "./hash";
import { checkRateLimit } from "./rate-limit";
import { onboardingSchema, requestLoginOtpSchema, verifyLoginOtpSchema } from "./schema";
import { getActor } from "./session";

/**
 * Status/error codes, not user-facing strings — the client maps these to translated
 * copy (ko/en) via next-intl, same pattern as src/server/waitlist/actions.ts.
 */
export type LoginRequestState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; code: "INVALID_INPUT" | "INVALID_DOMAIN" | "RATE_LIMITED" | "UNKNOWN" };

export type LoginVerifyState =
  | { status: "idle" }
  | { status: "verified" }
  | { status: "error"; code: "INVALID_INPUT" | "INCORRECT_CODE" | "UNKNOWN" };

export type OnboardingState =
  | { status: "idle" }
  | { status: "complete"; datingAvailable: boolean }
  | {
      status: "error";
      code:
        | "INVALID_INPUT"
        | "UNAUTHENTICATED"
        | "INVALID_DOMAIN"
        | "IMPLAUSIBLE_YEAR"
        | "INVALID_DATE"
        | "NOT_ATTESTED"
        | "TOO_YOUNG"
        | "INVALID_INVITE"
        | "UNKNOWN";
    };

const LOGIN_OTP_RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };

export async function requestLoginOtp(
  _prev: LoginRequestState,
  formData: FormData,
): Promise<LoginRequestState> {
  const parsed = requestLoginOtpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }
  const email = normalizeEmail(parsed.data.email);

  // Checked before Better Auth ever generates a code: an account should never come
  // into existence for a non-campus email in the first place.
  const campus = await resolveCampusForEmail(prisma, email);
  if (!campus) {
    return { status: "error", code: "INVALID_DOMAIN" };
  }

  const rate = await checkRateLimit(prisma, `signin-otp-request:${email}`, LOGIN_OTP_RATE_LIMIT);
  if (!rate.allowed) {
    return { status: "error", code: "RATE_LIMITED" };
  }

  try {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  } catch {
    return { status: "error", code: "UNKNOWN" };
  }

  return { status: "sent", email };
}

export async function verifyLoginOtp(
  _prev: LoginVerifyState,
  formData: FormData,
): Promise<LoginVerifyState> {
  const parsed = verifyLoginOtpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }
  const email = normalizeEmail(parsed.data.email);

  try {
    // nextCookies (last plugin in src/server/auth/auth.ts) sets the session cookie
    // automatically here — no manual header/cookie handling needed.
    await auth.api.signInEmailOTP({ body: { email, otp: parsed.data.code } });
  } catch {
    return { status: "error", code: "INCORRECT_CODE" };
  }

  return { status: "verified" };
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const actor = await getActor();
  if (!actor) {
    return { status: "error", code: "UNAUTHENTICATED" };
  }

  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  return completeAccountSetup(
    { db: prisma, verifier: getActiveAgeVerifier(), cohortRelease: isCohortReleaseEnabled() },
    {
      userId: actor.userId,
      birthYear: parsed.data.birthYear,
      birthMonth: parsed.data.birthMonth,
      birthDay: parsed.data.birthDay,
      attestedAdult: parsed.data.attestedAdult === "on",
      sensitiveGranted: parsed.data.sensitivePreference === "on",
      inviteCode: parsed.data.inviteCode,
      source: "onboarding",
    },
  );
}

export async function signOutEverywhere(): Promise<void> {
  await auth.api.revokeSessions({ headers: await headers() });
}
