"use server";

import { resolveCampusForEmail } from "@/server/auth/campus";
import { normalizeEmail } from "@/server/auth/hash";
import {
  generateOtp,
  hashOtp,
  isOtpExpired,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  otpExpiryFrom,
  otpMatches,
} from "@/server/auth/otp";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { countVerifiedReferrals } from "./referrals";
import { requestOtpSchema, verifyOtpSchema } from "./schema";

/**
 * Error/status codes, not user-facing strings: server modules never own copy, the
 * client component maps these to translated text (ko/en) via next-intl.
 */
export type RequestOtpState =
  | { status: "idle" }
  | { status: "sent"; waitlistId: string; email: string }
  | { status: "already-verified" }
  | {
      status: "error";
      code: "INVALID_INPUT" | "INVALID_DOMAIN" | "RATE_LIMITED" | "COOLDOWN" | "UNKNOWN";
    };

export type VerifyOtpState =
  | { status: "idle" }
  | { status: "verified"; waitlistId: string }
  | {
      status: "error";
      code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "EXPIRED"
        | "TOO_MANY_ATTEMPTS"
        | "INCORRECT_CODE"
        | "UNKNOWN";
      attemptsRemaining?: number;
    };

const OTP_REQUEST_RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };

export async function requestWaitlistOtp(
  _prev: RequestOtpState,
  formData: FormData,
): Promise<RequestOtpState> {
  const parsed = requestOtpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }
  const email = normalizeEmail(parsed.data.email);

  const campus = await resolveCampusForEmail(prisma, email);
  if (!campus) {
    return { status: "error", code: "INVALID_DOMAIN" };
  }

  const rate = await checkRateLimit(prisma, `otp-request:${email}`, OTP_REQUEST_RATE_LIMIT);
  if (!rate.allowed) {
    return { status: "error", code: "RATE_LIMITED" };
  }

  const now = new Date();
  const existing = await prisma.waitlist.findUnique({
    where: { campusId_email: { campusId: campus.id, email } },
  });

  if (existing?.verifiedAt) {
    return { status: "already-verified" };
  }
  if (
    existing?.otpLastSentAt &&
    now.getTime() - existing.otpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    return { status: "error", code: "COOLDOWN" };
  }

  const code = generateOtp();

  // Referral attribution only applies the first time this row is created, and only for
  // a `ref` that actually resolves to another waitlist entry on the same campus — an
  // invalid or stale ref silently doesn't attribute anything rather than failing signup.
  let referredById: string | undefined;
  if (!existing && parsed.data.ref) {
    const referrer = await prisma.waitlist.findFirst({
      where: { id: parsed.data.ref, campusId: campus.id },
      select: { id: true },
    });
    referredById = referrer?.id;
  }

  const entry = await prisma.waitlist.upsert({
    where: { campusId_email: { campusId: campus.id, email } },
    create: {
      campusId: campus.id,
      email,
      consentedAt: now,
      otpCodeHash: hashOtp(code),
      otpExpiresAt: otpExpiryFrom(now),
      otpAttempts: 0,
      otpLastSentAt: now,
      ...(referredById ? { referredById } : {}),
    },
    update: {
      consentedAt: now,
      otpCodeHash: hashOtp(code),
      otpExpiresAt: otpExpiryFrom(now),
      otpAttempts: 0,
      otpLastSentAt: now,
    },
  });

  await sendEmail({
    to: email,
    subject: "Overlap verification code",
    text: `Your Overlap waitlist verification code is ${code}. It expires in 10 minutes.`,
  });

  return { status: "sent", waitlistId: entry.id, email };
}

export async function verifyWaitlistOtp(
  _prev: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const parsed = verifyOtpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }
  const { waitlistId, code } = parsed.data;

  const entry = await prisma.waitlist.findUnique({ where: { id: waitlistId } });
  if (!entry) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (entry.verifiedAt) {
    return { status: "verified", waitlistId: entry.id };
  }
  if (!entry.otpCodeHash || !entry.otpExpiresAt || isOtpExpired(entry.otpExpiresAt, new Date())) {
    return { status: "error", code: "EXPIRED" };
  }
  if (entry.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { status: "error", code: "TOO_MANY_ATTEMPTS" };
  }

  if (!otpMatches(code, entry.otpCodeHash)) {
    await prisma.waitlist.update({
      where: { id: entry.id },
      data: { otpAttempts: { increment: 1 } },
    });
    const attemptsRemaining = OTP_MAX_ATTEMPTS - (entry.otpAttempts + 1);
    return { status: "error", code: "INCORRECT_CODE", attemptsRemaining };
  }

  await prisma.waitlist.update({
    where: { id: entry.id },
    data: {
      verifiedAt: new Date(),
      otpCodeHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    },
  });

  return { status: "verified", waitlistId: entry.id };
}

export async function getWaitlistCount(): Promise<number> {
  return prisma.waitlist.count({ where: { verifiedAt: { not: null } } });
}

/** Number of friends who joined through this entry's invite link; 0 for anything invalid. */
export async function getReferralCount(waitlistId: string): Promise<number> {
  const id = verifyOtpSchema.shape.waitlistId.safeParse(waitlistId);
  if (!id.success) return 0;
  return countVerifiedReferrals(prisma, id.data);
}
