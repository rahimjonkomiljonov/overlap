"use server";

import { VerificationDecision } from "@/generated/prisma/enums";
import { recordAuditLog } from "@/server/admin/audit";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { newSelfieStorageKey, processSelfie, uploadSelfie } from "@/server/storage/selfies";
import { reviewSelfieSchema } from "./schema";

const MAX_SELFIE_BYTES = 8 * 1024 * 1024;

export type SubmitSelfieState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** User-facing: submit a live selfie for verification (A4). One PENDING at a time. */
export async function submitSelfie(_prev: SubmitSelfieState, formData: FormData): Promise<SubmitSelfieState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const file = formData.get("selfie");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", code: "INVALID_INPUT" };
  }
  if (file.size > MAX_SELFIE_BYTES) {
    return { status: "error", code: "FILE_TOO_LARGE" };
  }
  if (!file.type.startsWith("image/")) {
    return { status: "error", code: "INVALID_FILE_TYPE" };
  }

  const pending = await prisma.selfie.findFirst({
    where: { userId: actor.userId, decision: VerificationDecision.PENDING },
    select: { id: true },
  });
  if (pending) {
    return { status: "error", code: "ALREADY_PENDING" };
  }

  let processed;
  try {
    processed = await processSelfie(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { status: "error", code: "INVALID_FILE_TYPE" };
  }

  const storageKey = newSelfieStorageKey(actor.userId);
  await uploadSelfie(storageKey, processed.bytes);
  await prisma.selfie.create({ data: { userId: actor.userId, storageKey } });

  return { status: "success" };
}

export type ReviewSelfieState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * Moderator/admin-facing: approve or reject a pending selfie (H2). Always writes an
 * audit row (H3) and, on approval, sets `User.verifiedAt`; a ban/suspension is never
 * decided here — this only ever changes a `Selfie` row and (on approval) `verifiedAt`.
 */
export async function reviewSelfie(_prev: ReviewSelfieState, formData: FormData): Promise<ReviewSelfieState> {
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
    parsed.data.decision === "APPROVED" ? VerificationDecision.APPROVED : VerificationDecision.REJECTED;
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
      action: decision === VerificationDecision.APPROVED ? "verification_approved" : "verification_rejected",
      targetType: "User",
      targetId: selfie.userId,
      reason: parsed.data.reason,
    });
  });

  return { status: "success" };
}
