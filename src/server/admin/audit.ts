import type { PrismaClient, Prisma } from "@/generated/prisma/client";

/**
 * Immutable admin audit log (H3): every admin/moderator action writes one row here.
 * Append-only by convention now; S20 revokes UPDATE/DELETE for the app's DB role on
 * this table so it's append-only at the database level too (see the TODO on
 * AuditLog in prisma/schema.prisma).
 */

export type AuditDb = Pick<PrismaClient, "auditLog">;

export async function recordAuditLog(
  db: AuditDb,
  input: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason ?? null,
      metadata: input.metadata,
    },
  });
}
