"use server";

import * as z from "zod";
import { UserStatus } from "@/generated/prisma/enums";
import { recordAuditLog } from "@/server/admin/audit";
import { can, Role } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { checkLiftSuspension } from "./suspensions";

export type LiftSuspensionState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

// Better Auth user ids are 32-character alphanumeric strings, not UUIDs (see CLAUDE.md).
const liftSuspensionSchema = z.object({
  userId: z.string().min(1).max(64),
  note: z.string().trim().min(1).max(500),
});

/**
 * Lifts one named suspension early. Moderator or admin only, and always one specific
 * account at a time: there is deliberately no "lift all". The reason is required and goes
 * to the audit log together with who did it; the original moderation action and report stay
 * on record untouched.
 */
export async function liftSuspension(_prev: LiftSuspensionState, formData: FormData): Promise<LiftSuspensionState> {
  const actor = await getActor();
  if (!actor || !can(actor, Role.MODERATOR)) return { status: "error", code: "FORBIDDEN" };

  const parsed = liftSuspensionSchema.safeParse({ userId: formData.get("userId"), note: formData.get("note") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, status: true, suspendedUntil: true },
  });
  if (!target) return { status: "error", code: "NOT_FOUND" };

  const check = checkLiftSuspension({ actorId: actor.userId, targetId: target.id, targetStatus: target.status });
  if (!check.ok) return { status: "error", code: check.code };

  let lifted = false;
  await prisma.$transaction(async (tx) => {
    // Re-checked in the same statement: only flips an account that is still suspended, so
    // two moderators clicking at once can't act on a stale row.
    const updated = await tx.user.updateMany({
      where: { id: target.id, status: UserStatus.SUSPENDED },
      data: { status: UserStatus.ACTIVE, suspendedUntil: null },
    });
    if (updated.count === 0) return;
    lifted = true;

    await recordAuditLog(tx, {
      actorId: actor.userId,
      action: "user.lift_suspension",
      targetType: "user",
      targetId: target.id,
      reason: parsed.data.note,
      metadata: { suspendedUntil: target.suspendedUntil?.toISOString() ?? null },
    });
  });
  if (!lifted) return { status: "error", code: "NOT_SUSPENDED" };

  return { status: "success" };
}
