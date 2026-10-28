"use server";

import { recordAuditLog } from "@/server/admin/audit";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { submitTrustAppealStep } from "@/server/safety/service";
import { reviewTrustAppealSchema, submitTrustAppealSchema } from "./schema";
import { REACH_RESTORE_DAYS } from "./score";

export type TrustActionState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** G10: the affected user's appeal against their own reach limit. One open appeal at a time. */
export async function submitTrustAppeal(_prev: TrustActionState, formData: FormData): Promise<TrustActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const limit = await checkRateLimit(prisma, `trust-appeal:${actor.userId}`, {
    max: 5,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!limit.allowed) return { status: "error", code: "RATE_LIMITED" };

  const parsed = submitTrustAppealSchema.safeParse({ note: formData.get("note") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await submitTrustAppealStep(prisma, { userId: actor.userId }, parsed.data.note);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

/**
 * G10 human review. Accepting lifts the reach limit for REACH_RESTORE_DAYS; either way
 * the user sees the stated response on their safety page. Moderator or admin only.
 */
export async function reviewTrustAppeal(_prev: TrustActionState, formData: FormData): Promise<TrustActionState> {
  const actor = await getActor();
  if (!actor || !can(actor, Role.MODERATOR)) return { status: "error", code: "FORBIDDEN" };

  const parsed = reviewTrustAppealSchema.safeParse({
    appealId: formData.get("appealId"),
    decision: formData.get("decision"),
    response: formData.get("response"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const appeal = await prisma.trustAppeal.findUnique({
    where: { id: parsed.data.appealId },
    select: { id: true, userId: true, status: true },
  });
  if (!appeal || appeal.status !== "OPEN") return { status: "error", code: "NOT_FOUND" };
  if (appeal.userId === actor.userId) return { status: "error", code: "FORBIDDEN" };

  const now = new Date();
  const { decision, response } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.trustAppeal.update({
      where: { id: appeal.id },
      data: { status: decision, response, reviewerId: actor.userId, resolvedAt: now },
    });
    if (decision === "ACCEPTED") {
      await tx.user.update({
        where: { id: appeal.userId },
        data: { reachRestoredUntil: new Date(now.getTime() + REACH_RESTORE_DAYS * 24 * 60 * 60 * 1000) },
      });
    }
    await recordAuditLog(tx, {
      actorId: actor.userId,
      action: `trust_appeal_${decision.toLowerCase()}`,
      targetType: "User",
      targetId: appeal.userId,
      reason: response,
      metadata: { appealId: appeal.id },
    });
  });
  return { status: "success" };
}
