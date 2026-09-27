import type { PrismaClient } from "@/generated/prisma/client";
import type { ReportPriority, ReportStatus } from "@/generated/prisma/enums";
import { MeetupStatus, ReportStatus as ReportStatusValues } from "@/generated/prisma/enums";
import { isOverdue, slaWindowMs } from "@/server/moderation/sla";
import { TARGET_BATCH_SIZE } from "@/server/matching/compose";

/**
 * S21: admin ops dashboard queries. REQUIREMENTS.md §13 names a much larger metrics set
 * (D7/D30 retention, exposure Gini, etc.) than BUILD_PLAN's S21 line actually asks for —
 * this module builds exactly what S21 names (funnel counts, candidate density, report-SLA
 * stats), not the full §13 catalog; a later step can extend it if the owner wants more.
 */

// --- Funnel: signup -> verified -> profile complete -> wave -> match -> message -> meetup.
// Counts real users only; this environment has no real campus users yet (O4/O8), so today
// these numbers reflect e2e/manual test accounts, not launch activity — that's expected in
// the local-only phase, not a bug in the query.

export type FunnelDb = Pick<PrismaClient, "user" | "profile" | "wave" | "match" | "message" | "meetProposal">;

export interface FunnelCounts {
  signups: number;
  verified: number;
  profileComplete: number;
  sentFirstWave: number;
  matched: number;
  messaged: number;
  meetupAccepted: number;
}

export async function getFunnelCounts(db: FunnelDb): Promise<FunnelCounts> {
  const [signups, verified, profileComplete, wavers, matchRows, messengers, meetupUsers] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { verifiedAt: { not: null } } }),
    db.profile.count({ where: { completedAt: { not: null } } }),
    db.wave.findMany({ distinct: ["fromUserId"], select: { fromUserId: true } }),
    db.match.findMany({ select: { userAId: true, userBId: true } }),
    db.message.findMany({ distinct: ["senderId"], select: { senderId: true } }),
    db.meetProposal.findMany({
      where: { status: MeetupStatus.ACCEPTED },
      select: { proposedByUserId: true, respondedByUserId: true },
    }),
  ]);

  const matchedUsers = new Set<string>();
  for (const m of matchRows) {
    matchedUsers.add(m.userAId);
    matchedUsers.add(m.userBId);
  }

  const meetupUserIds = new Set<string>();
  for (const m of meetupUsers) {
    meetupUserIds.add(m.proposedByUserId);
    if (m.respondedByUserId) meetupUserIds.add(m.respondedByUserId);
  }

  return {
    signups,
    verified,
    profileComplete,
    sentFirstWave: wavers.length,
    matched: matchedUsers.size,
    messaged: messengers.length,
    meetupAccepted: meetupUserIds.size,
  };
}

// --- Liquidity: candidates per user. This schema never persists the raw candidate pool
// (only the composed, already-capped-at-6 daily batch — src/server/matching/compose.ts),
// so "candidates per user" here means "items in the most recent day's batches", the
// closest real signal on hand — not the pre-composition pool size REQUIREMENTS.md §13
// literally names. Documented the same way S10/S19 flagged similar schema gaps rather than
// inventing data that doesn't exist.

export type DensityDb = Pick<PrismaClient, "dailyBatch">;

export interface DensitySnapshot {
  batchDate: Date | null;
  batchCount: number;
  averageItemsPerBatch: number;
  fullBatchPct: number | null;
}

export async function getCandidateDensity(db: DensityDb): Promise<DensitySnapshot> {
  const latest = await db.dailyBatch.findFirst({
    orderBy: { batchDate: "desc" },
    select: { batchDate: true },
  });
  if (!latest) {
    return { batchDate: null, batchCount: 0, averageItemsPerBatch: 0, fullBatchPct: null };
  }

  const batches = await db.dailyBatch.findMany({
    where: { batchDate: latest.batchDate },
    select: { items: { select: { id: true } } },
  });

  const counts = batches.map((b) => b.items.length);
  const batchCount = counts.length;
  const averageItemsPerBatch = batchCount === 0 ? 0 : counts.reduce((a, b) => a + b, 0) / batchCount;
  const fullBatchPct =
    batchCount === 0 ? null : counts.filter((c) => c >= TARGET_BATCH_SIZE).length / batchCount;

  return { batchDate: latest.batchDate, batchCount, averageItemsPerBatch, fullBatchPct };
}

// --- Safety guardrail: report SLA stats (H1: urgent < 2h, standard < 24h).

export interface ReportSlaRow {
  priority: ReportPriority;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ReportSlaSnapshot {
  totalReports: number;
  openCount: number;
  openOverdueCount: number;
  resolvedCount: number;
  resolvedWithinSlaCount: number;
  resolvedWithinSlaPct: number | null;
  medianResolutionMs: number | null;
}

function median(sortedValues: number[]): number | null {
  if (sortedValues.length === 0) return null;
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
    : sortedValues[mid];
}

/** Pure so it's directly unit-testable against fixed report rows, same shape as moderation/sla.ts. */
export function summarizeReportSla(reports: ReportSlaRow[], now: Date): ReportSlaSnapshot {
  const open = reports.filter((r) => r.status === ReportStatusValues.OPEN);
  const resolved = reports.filter((r) => r.resolvedAt !== null);

  const resolutionTimesMs = resolved
    .map((r) => r.resolvedAt!.getTime() - r.createdAt.getTime())
    .sort((a, b) => a - b);

  const withinSlaCount = resolved.filter(
    (r) => r.resolvedAt!.getTime() - r.createdAt.getTime() <= slaWindowMs(r.priority),
  ).length;

  return {
    totalReports: reports.length,
    openCount: open.length,
    openOverdueCount: open.filter((r) => isOverdue(r.priority, r.createdAt, now)).length,
    resolvedCount: resolved.length,
    resolvedWithinSlaCount: withinSlaCount,
    resolvedWithinSlaPct: resolved.length === 0 ? null : withinSlaCount / resolved.length,
    medianResolutionMs: median(resolutionTimesMs),
  };
}

export type ReportSlaDb = Pick<PrismaClient, "report">;

export async function getReportSlaSnapshot(db: ReportSlaDb, now = new Date()): Promise<ReportSlaSnapshot> {
  const reports = await db.report.findMany({
    select: { priority: true, status: true, createdAt: true, resolvedAt: true },
  });
  return summarizeReportSla(reports, now);
}
