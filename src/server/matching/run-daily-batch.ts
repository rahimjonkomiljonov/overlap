import { IntentMode } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { computeCampusMatches } from "./batch";
import { loadCampusMatchPool } from "./candidates";
import { composeBatch, type ComposeBatchResult } from "./compose";
import { computeIdfStats } from "./idf";
import { seoulCalendarDate } from "./seoul-date";
import { buildIdfLookup } from "./terms";

export type RunDailyBatchDb = Pick<
  PrismaClient,
  "user" | "block" | "hideRule" | "dailyBatch" | "profile" | "profileCourse" | "profileClub" | "profileInterestTag" | "idfStat"
>;

export interface RunDailyBatchOptions {
  now?: Date;
  chunkSize?: number;
  exposureCap?: number;
}

export interface IntentRunSummary {
  intent: IntentMode;
  eligibleUsers: number;
  alreadyBatched: number;
  newlyBatched: number;
  lowDensityCount: number;
}

export interface RunDailyBatchSummary {
  campusId: string;
  /** "YYYY-MM-DD", the Seoul calendar date this run composed batches for. */
  batchDate: string;
  intents: IntentRunSummary[];
}

const DEFAULT_CHUNK_SIZE = 100;

/**
 * The daily cron's actual work for one campus (REQUIREMENTS.md §5.3/C1), called by the
 * route handler in src/app/api/cron/daily-batch. Idempotent by construction: every user
 * who already has a `DailyBatch` row for (intent, today) — including one with zero
 * items, from a low-density run — is skipped entirely on a re-run, which is what makes
 * "a second run changes nothing" (S11's own "Done when") true without any extra
 * bookkeeping. "Chunked": each intent's eligible users are persisted `chunkSize` at a
 * time rather than as one giant batch of writes, bounding how much work is in flight —
 * a chunk boundary is also naturally a safe place to stop and resume, since anyone
 * already written is skipped next time regardless of where a run stopped.
 */
export async function runDailyBatchForCampus(
  db: RunDailyBatchDb,
  campusId: string,
  options: RunDailyBatchOptions = {},
): Promise<RunDailyBatchSummary> {
  const now = options.now ?? new Date();
  const batchDate = seoulCalendarDate(now);
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  await computeIdfStats(db, campusId);
  const idfRows = await db.idfStat.findMany({
    where: { campusId },
    select: { featureType: true, featureId: true, idf: true },
  });
  const idf = buildIdfLookup(idfRows);

  // Loaded once, then threaded (and mutated) through every composeBatch call across
  // every intent below — the 25/day exposure cap is a running total for the whole
  // campus+day, not scoped to one intent (§5.3).
  const exposureCounts = await loadTodayExposureCounts(db, campusId, batchDate);

  const intentSummaries: IntentRunSummary[] = [];
  for (const intent of Object.values(IntentMode)) {
    const pool = await loadCampusMatchPool(db, campusId, intent, { now });
    const results = computeCampusMatches(pool, intent, idf);
    const joinedAtByUserId = new Map(pool.profiles.map((p) => [p.userId, p.joinedAt]));
    const userIds = pool.profiles.map((p) => p.userId);

    const alreadyBatched = await loadAlreadyBatchedUserIds(db, userIds, intent, batchDate);
    const toProcess = userIds.filter((id) => !alreadyBatched.has(id));

    let newlyBatched = 0;
    let lowDensityCount = 0;
    for (let i = 0; i < toProcess.length; i += chunkSize) {
      const chunk = toProcess.slice(i, i + chunkSize);
      for (const userId of chunk) {
        const composed = composeBatch(results.get(userId) ?? [], {
          joinedAtByUserId,
          now,
          exposureCounts,
          exposureCap: options.exposureCap,
        });
        await persistBatch(db, userId, intent, batchDate, composed);
        newlyBatched++;
        if (composed.lowDensity) lowDensityCount++;
      }
    }

    intentSummaries.push({
      intent,
      eligibleUsers: userIds.length,
      alreadyBatched: alreadyBatched.size,
      newlyBatched,
      lowDensityCount,
    });
  }

  return { campusId, batchDate: batchDate.toISOString().slice(0, 10), intents: intentSummaries };
}

/**
 * The on-demand counterpart to `runDailyBatchForCampus`, for src/server/picks/queries.ts:
 * ensures today's batch exists for one specific user+intent, computing and persisting it
 * right now if the cron hasn't gotten to them yet (or hasn't run at all — the case for
 * every fresh dev/e2e signup). Reuses the exact same pool-loading, scoring, composing and
 * persisting logic as the campus-wide run, so a user who visits /picks before noon KST
 * sees the identical batch the cron would have given them, and — thanks to `DailyBatch`'s
 * unique constraint — the cron run later that day is a no-op for them either way.
 *
 * A user who isn't in the pool yet themselves (not verified, profile incomplete — the
 * same eligibility this function's candidates are held to) gets nothing persisted at
 * all, deliberately: writing an empty batch now would idempotently block a real one from
 * ever generating later today once they do become eligible.
 */
export async function ensureTodaysBatchForUser(
  db: RunDailyBatchDb,
  userId: string,
  campusId: string,
  intent: IntentMode,
  options: RunDailyBatchOptions = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const batchDate = seoulCalendarDate(now);

  const existing = await db.dailyBatch.findUnique({
    where: { userId_intent_batchDate: { userId, intent, batchDate } },
    select: { id: true },
  });
  if (existing) return;

  await computeIdfStats(db, campusId);
  const idfRows = await db.idfStat.findMany({
    where: { campusId },
    select: { featureType: true, featureId: true, idf: true },
  });
  const idf = buildIdfLookup(idfRows);

  const pool = await loadCampusMatchPool(db, campusId, intent, { now });
  if (!pool.profiles.some((p) => p.userId === userId)) return;

  const results = computeCampusMatches(pool, intent, idf);
  const joinedAtByUserId = new Map(pool.profiles.map((p) => [p.userId, p.joinedAt]));
  const exposureCounts = await loadTodayExposureCounts(db, campusId, batchDate);

  const composed = composeBatch(results.get(userId) ?? [], {
    joinedAtByUserId,
    now,
    exposureCounts,
    exposureCap: options.exposureCap,
  });
  await persistBatch(db, userId, intent, batchDate, composed);
}

async function persistBatch(
  db: RunDailyBatchDb,
  userId: string,
  intent: IntentMode,
  batchDate: Date,
  composed: ComposeBatchResult,
): Promise<void> {
  await db.dailyBatch.create({
    data: {
      userId,
      intent,
      batchDate,
      items: {
        create: composed.items.map((item) => ({
          candidateUserId: item.candidateUserId,
          score: item.score,
          rank: item.rank,
          reasons: item.reasons as unknown as Prisma.InputJsonValue,
        })),
      },
    },
  });
}

async function loadAlreadyBatchedUserIds(
  db: RunDailyBatchDb,
  userIds: string[],
  intent: IntentMode,
  batchDate: Date,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.dailyBatch.findMany({
    where: { userId: { in: userIds }, intent, batchDate },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

async function loadTodayExposureCounts(db: RunDailyBatchDb, campusId: string, batchDate: Date): Promise<Map<string, number>> {
  const batches = await db.dailyBatch.findMany({
    where: { batchDate, user: { campusId } },
    select: { items: { select: { candidateUserId: true } } },
  });
  const counts = new Map<string, number>();
  for (const batch of batches) {
    for (const item of batch.items) {
      counts.set(item.candidateUserId, (counts.get(item.candidateUserId) ?? 0) + 1);
    }
  }
  return counts;
}
