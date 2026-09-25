"use server";

import type { Prisma } from "@/generated/prisma/client";
import { ReportStatus, UserStatus } from "@/generated/prisma/enums";
import { recordAuditLog } from "@/server/admin/audit";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { getConversationForActor, getMessages } from "@/server/chat/queries";
import { prisma } from "@/server/db";
import { buildEvidenceSnapshot } from "./evidence";
import { priorityForCategory } from "./priority";
import { appealSchema, fileReportSchema, moderationActionSchema } from "./schema";

/** G8: the fixed length of the strike ladder's middle rung. */
const SUSPENSION_DAYS = 7;

export type FileReportState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * User-facing 2-tap report (G1). When filed from an open chat thread, snapshots up to the
 * last 50 messages as evidence — the only way a human ever sees chat content. Always
 * auto-hides the reported user from the reporter immediately, before any moderator
 * decision, per the moderation playbook.
 */
export async function fileReport(_prev: FileReportState, formData: FormData): Promise<FileReportState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = fileReportSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    category: formData.get("category"),
    description: formData.get("description") || undefined,
    conversationId: formData.get("conversationId") || undefined,
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const { targetUserId, category, description, conversationId } = parsed.data;
  if (targetUserId === actor.userId) return { status: "error", code: "CANNOT_REPORT_SELF" };

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) return { status: "error", code: "NOT_FOUND" };

  let evidence = null as ReturnType<typeof buildEvidenceSnapshot> | null;
  if (conversationId) {
    const conversation = await getConversationForActor(prisma, conversationId, actor.userId);
    if (!conversation || conversation.otherUserId !== targetUserId) {
      return { status: "error", code: "INVALID_CONVERSATION" };
    }
    const messages = await getMessages(prisma, conversationId);
    evidence = buildEvidenceSnapshot(messages);
  }

  const priority = priorityForCategory(category);

  await prisma.$transaction(async (tx) => {
    await tx.report.create({
      data: {
        reporterId: actor.userId,
        targetId: targetUserId,
        conversationId: conversationId ?? null,
        category,
        priority,
        description: description ?? null,
        evidence: evidence ? (evidence as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    await tx.hideRule.upsert({
      where: { userId_hiddenUserId: { userId: actor.userId, hiddenUserId: targetUserId } },
      update: {},
      create: { userId: actor.userId, hiddenUserId: targetUserId },
    });
  });

  return { status: "success" };
}

export type TakeModerationActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * Moderator/admin-facing: dismiss, warn, suspend, ban, or refer a report to police (H1).
 * Always writes an audit row (H3); SUSPEND/BAN are the only types that ever change
 * `User.status`, and both require `reason` (Zod: min length 1) — a ban can never happen
 * without a moderator action and a stated reason (this step's own "Done when").
 */
export async function takeModerationAction(
  _prev: TakeModerationActionState,
  formData: FormData,
): Promise<TakeModerationActionState> {
  const actor = await getActor();
  if (!actor || !can(actor, Role.MODERATOR)) {
    return { status: "error", code: "FORBIDDEN" };
  }

  const parsed = moderationActionSchema.safeParse({
    reportId: formData.get("reportId"),
    type: formData.get("type"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const report = await prisma.report.findUnique({
    where: { id: parsed.data.reportId },
    select: { id: true, targetId: true, status: true },
  });
  if (!report || report.status !== ReportStatus.OPEN) {
    return { status: "error", code: "NOT_FOUND" };
  }

  const { type, reason } = parsed.data;
  const decidedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.moderationAction.create({
      data: { reportId: report.id, targetId: report.targetId, actorId: actor.userId, type, reason },
    });
    await tx.report.update({ where: { id: report.id }, data: { status: ReportStatus.RESOLVED, resolvedAt: decidedAt } });

    if (type === "SUSPEND") {
      await tx.user.update({
        where: { id: report.targetId },
        data: {
          status: UserStatus.SUSPENDED,
          suspendedUntil: new Date(decidedAt.getTime() + SUSPENSION_DAYS * 24 * 60 * 60 * 1000),
        },
      });
    } else if (type === "BAN") {
      await tx.user.update({
        where: { id: report.targetId },
        data: { status: UserStatus.BANNED, suspendedUntil: null },
      });
    }

    await recordAuditLog(tx, {
      actorId: actor.userId,
      action: `moderation_${type.toLowerCase()}`,
      targetType: "User",
      targetId: report.targetId,
      reason,
      metadata: { reportId: report.id },
    });
  });

  return { status: "success" };
}

export type SubmitAppealState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** The affected user's own one-time appeal on a moderation action taken against them (PIPA Art. 37-2). */
export async function submitAppeal(_prev: SubmitAppealState, formData: FormData): Promise<SubmitAppealState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = appealSchema.safeParse({
    moderationActionId: formData.get("moderationActionId"),
    appealNote: formData.get("appealNote"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const action = await prisma.moderationAction.findUnique({
    where: { id: parsed.data.moderationActionId },
    select: { id: true, targetId: true, appealedAt: true },
  });
  if (!action || action.targetId !== actor.userId) return { status: "error", code: "NOT_FOUND" };
  if (action.appealedAt) return { status: "error", code: "ALREADY_APPEALED" };

  await prisma.moderationAction.update({
    where: { id: action.id },
    data: { appealNote: parsed.data.appealNote, appealedAt: new Date() },
  });

  return { status: "success" };
}
