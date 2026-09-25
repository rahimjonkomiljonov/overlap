import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import {
  ModerationActionType,
  ReportCategory,
  ReportPriority,
  ReportStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import { countPriorStrikes } from "@/server/moderation/strikes";
import { slaDeadline } from "@/server/moderation/sla";
import type { EvidenceMessage } from "./evidence";

/**
 * H4: the same "moderators never see sensitive fields" enforcement as
 * verification/queries.ts's own comment — `Profile.interestedIn` is never named in
 * either select below, so it never leaves the database for a report queue read, however
 * the result is later used. See queries.test.ts for a negative-control test.
 */

export type ReportsQueueDb = Pick<PrismaClient, "report">;

export interface ReportActionView {
  id: string;
  type: ModerationActionType;
  reason: string;
  actorName: string;
  createdAt: Date;
  appealNote: string | null;
  appealedAt: Date | null;
}

export interface ReportQueueItem {
  reportId: string;
  category: ReportCategory;
  priority: ReportPriority;
  status: ReportStatus;
  createdAt: Date;
  slaDeadline: Date;
  description: string | null;
  evidence: EvidenceMessage[] | null;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  targetStatus: UserStatus;
  /** Count of prior WARN/SUSPEND/BAN actions against this target, across every report — not just this one (G8's ladder is per-account, not per-report). */
  priorStrikes: number;
  actions: ReportActionView[];
}

const QUEUE_SELECT = {
  id: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  description: true,
  evidence: true,
  reporterId: true,
  reporter: { select: { name: true } },
  targetId: true,
  target: {
    select: {
      name: true,
      status: true,
      moderationActionsReceived: { select: { type: true } },
    },
  },
  actions: {
    select: {
      id: true,
      type: true,
      reason: true,
      createdAt: true,
      appealNote: true,
      appealedAt: true,
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ReportSelect;

function toQueueItem(row: Prisma.ReportGetPayload<{ select: typeof QUEUE_SELECT }>): ReportQueueItem {
  return {
    reportId: row.id,
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdAt: row.createdAt,
    slaDeadline: slaDeadline(row.priority, row.createdAt),
    description: row.description,
    evidence: (row.evidence as EvidenceMessage[] | null) ?? null,
    reporterId: row.reporterId,
    reporterName: row.reporter.name,
    targetId: row.targetId,
    targetName: row.target.name,
    targetStatus: row.target.status,
    priorStrikes: countPriorStrikes(row.target.moderationActionsReceived.map((a) => a.type)),
    actions: row.actions.map((a) => ({
      id: a.id,
      type: a.type,
      reason: a.reason,
      actorName: a.actor.name,
      createdAt: a.createdAt,
      appealNote: a.appealNote,
      appealedAt: a.appealedAt,
    })),
  };
}

/**
 * H1: open reports, urgent first then oldest first within a priority — `ReportPriority`
 * is declared URGENT before STANDARD, so Postgres's enum ordinal order already sorts
 * urgent-first ascending; no numeric priority column needed.
 */
export async function getReportsQueue(db: ReportsQueueDb, limit = 50): Promise<ReportQueueItem[]> {
  const rows = await db.report.findMany({
    where: { status: ReportStatus.OPEN },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: QUEUE_SELECT,
  });
  return rows.map(toQueueItem);
}

export async function getResolvedReports(db: ReportsQueueDb, limit = 20): Promise<ReportQueueItem[]> {
  const rows = await db.report.findMany({
    where: { status: ReportStatus.RESOLVED },
    orderBy: { resolvedAt: "desc" },
    take: limit,
    select: QUEUE_SELECT,
  });
  return rows.map(toQueueItem);
}

export type MyActionsDb = Pick<PrismaClient, "moderationAction">;

export interface MyModerationAction {
  id: string;
  type: ModerationActionType;
  reason: string;
  createdAt: Date;
  appealNote: string | null;
  appealedAt: Date | null;
}

/** For the affected user's own settings page — no admin data, so no H4 concern here. */
export async function getMyModerationActions(db: MyActionsDb, userId: string): Promise<MyModerationAction[]> {
  return db.moderationAction.findMany({
    where: { targetId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, reason: true, createdAt: true, appealNote: true, appealedAt: true },
  });
}
