"use server";

import { VerificationDecision } from "@/generated/prisma/enums";
import { recordAuditLog } from "@/server/admin/audit";
import { can, Role } from "@/server/auth/authz";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { submitSelfieStep } from "./selfie-service";
import { reviewSelfieSchema } from "./schema";

const MAX_SELFIE_BYTES = 8 * 1024 * 1024;

/** S20 hardening: selfie review is a moderator-limited resource, kept tighter than the general photo-upload limit. */
const SUBMIT_SELFIE_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };

export type SubmitSelfieState =
  { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** User-facing: submit a live selfie for verification (A4). One PENDING at a time. */
export async function submitSelfie(
  _prev: SubmitSelfieState,
  formData: FormData,
): Promise<SubmitSelfieState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const rate = await checkRateLimit(
    prisma,
    `submit-selfie:${actor.userId}`,
    SUBMIT_SELFIE_RATE_LIMIT,
  );
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const file = formData.get("selfie");
  if (!(file instanceof File)) return { status: "error", code: "INVALID_INPUT" };
  return submitSelfieStep(
    prisma,
    actor,
    { size: file.size, type: file.type, bytes: async () => Buffer.from(await file.arrayBuffer()) },
    MAX_SELFIE_BYTES,
  );
}

export type ReviewSelfieState =
  { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/**
 * Moderator/admin-facing: approve or reject a pending selfie (H2). Always writes an
 * audit row (H3) and, on approval, sets `User.verifiedAt`; a ban/suspension is never
 * decided here — this only ever changes a `Selfie` row and (on approval) `verifiedAt`.
 */
export async function reviewSelfie(
  _prev: ReviewSelfieState,
  formData: FormData,
): Promise<ReviewSelfieState> {
  const actor = await getActor();
  if (!actor || !can(actor, Role.MODERATOR)) {
    return { status: "error", code: "FORBIDDEN" };
  }

  const parsed = reviewSelfieSchema.safeParse({
    selfieId: formData.get("selfieId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const selfie = await prisma.selfie.findUnique({ where: { id: parsed.data.selfieId } });
  if (!selfie || selfie.decision !== VerificationDecision.PENDING) {
    return { status: "error", code: "NOT_FOUND" };
  }

  const decision =
    parsed.data.decision === "APPROVED"
      ? VerificationDecision.APPROVED
      : VerificationDecision.REJECTED;
  const decidedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.selfie.update({
      where: { id: selfie.id },
      data: { decision, decidedAt, decidedById: actor.userId, reason: parsed.data.reason ?? null },
    });
    if (decision === VerificationDecision.APPROVED) {
      await tx.user.update({ where: { id: selfie.userId }, data: { verifiedAt: decidedAt } });
    }
    await recordAuditLog(tx, {
      actorId: actor.userId,
      action:
        decision === VerificationDecision.APPROVED
          ? "verification_approved"
          : "verification_rejected",
      targetType: "User",
      targetId: selfie.userId,
      reason: parsed.data.reason,
    });
  });

  return { status: "success" };
}
