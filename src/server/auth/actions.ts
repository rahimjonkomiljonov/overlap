"use server";

import { headers } from "next/headers";
import { ConsentType } from "@/generated/prisma/enums";
import { getDatingStatus, isCohortReleaseEnabled, redeemInviteCode } from "@/server/cohorts/release";
import { recordConsent } from "@/server/consent/consent";
import { prisma } from "@/server/db";
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

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  const campus = await resolveCampusForEmail(prisma, user.email);
  if (!campus) {
    // Shouldn't happen (domain was already checked at login), but never leave an
    // account onboarded against no campus at all.
    return { status: "error", code: "INVALID_DOMAIN" };
  }

  const verifier = getActiveAgeVerifier();
  const result = verifier.verify({
    birthYear: parsed.data.birthYear,
    birthMonth: parsed.data.birthMonth,
    birthDay: parsed.data.birthDay,
    attestedAdult: parsed.data.attestedAdult === "on",
  });
  if (!result.eligible) {
    return { status: "error", code: result.reason };
  }

  const sensitiveGranted = parsed.data.sensitivePreference === "on";
  const cohortRelease = isCohortReleaseEnabled();
  if (cohortRelease && !parsed.data.inviteCode) {
    return { status: "error", code: "INVALID_INVITE" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Redeemed first and in the same transaction: a bad code leaves the account
      // exactly as it was, with no consents recorded and no campus set.
      if (cohortRelease) {
        const redeemed = await redeemInviteCode(tx, {
          userId: actor.userId,
          campusId: campus.id,
          code: parsed.data.inviteCode!,
        });
        if (!redeemed) throw new InvalidInviteError();
      }
      await tx.user.update({
      where: { id: actor.userId },
      data: {
        campusId: campus.id,
        birthYear: parsed.data.birthYear,
        ageVerifiedAt: result.verifiedAt,
      },
    });
    await recordConsent(tx, {
      userId: actor.userId,
      type: ConsentType.TERMS,
      granted: true,
      source: "onboarding",
    });
    await recordConsent(tx, {
      userId: actor.userId,
      type: ConsentType.PRIVACY_POLICY,
      granted: true,
      source: "onboarding",
    });
    await recordConsent(tx, {
      userId: actor.userId,
      type: ConsentType.SENSITIVE_PREFERENCE,
      granted: sensitiveGranted,
      source: "onboarding",
    });
    });
  } catch (error) {
    if (error instanceof InvalidInviteError) return { status: "error", code: "INVALID_INVITE" };
    throw error;
  }

  const datingStatus = await getDatingStatus(prisma, actor.userId, { cohortRelease });
  return { status: "complete", datingAvailable: datingStatus === "available" };
}

class InvalidInviteError extends Error {}

export async function signOutEverywhere(): Promise<void> {
  await auth.api.revokeSessions({ headers: await headers() });
}
