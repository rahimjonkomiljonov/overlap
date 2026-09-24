import type { Gender, IntentMode } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { ensureTodaysBatchForUser, type RunDailyBatchDb } from "@/server/matching/run-daily-batch";
import { seoulCalendarDate } from "@/server/matching/seoul-date";
import type { Explanation } from "@/server/matching/explain";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { buildLabelMaps, resolveReasons, type ResolvedReason } from "./reasons";

export type PicksDb = RunDailyBatchDb &
  Pick<PrismaClient, "profile" | "course" | "club" | "interestTag">;

export interface PickCardData {
  batchItemId: string;
  candidateUserId: string;
  firstName: string | null;
  gender: Gender | null;
  year: number | null;
  major: string | null;
  photos: { id: string; url: string }[];
  prompts: { id: string; textKo: string; textEn: string; answer: string }[];
  reasons: ResolvedReason[];
}

export interface IntentPicks {
  intent: IntentMode;
  /** Only undecided (decision === null) items — a "you're caught up" empty list is exactly what /picks needs to show the end state. */
  items: PickCardData[];
}

/**
 * Everything /picks needs to render, for every intent the actor has opted into. Ensures
 * today's batch exists first (composing it on demand if the cron hasn't run yet, or
 * hasn't run at all — every fresh dev/e2e user), so a brand-new signup never sees an
 * empty page just because noon KST hasn't happened.
 */
export async function getPicksForActor(
  db: PicksDb,
  actor: { userId: string; campusId: string },
  locale: string,
  now: Date = new Date(),
): Promise<IntentPicks[]> {
  const profile = await db.profile.findUnique({ where: { userId: actor.userId }, select: { intents: true } });
  if (!profile || profile.intents.length === 0) return [];

  for (const intent of profile.intents) {
    await ensureTodaysBatchForUser(db, actor.userId, actor.campusId, intent, { now });
  }

  const batchDate = seoulCalendarDate(now);
  const batches = await db.dailyBatch.findMany({
    where: { userId: actor.userId, intent: { in: profile.intents }, batchDate },
    select: {
      intent: true,
      items: {
        where: { decision: null },
        orderBy: { rank: "asc" },
        select: {
          id: true,
          candidateUserId: true,
          reasons: true,
          candidate: {
            select: {
              profile: {
                select: {
                  firstName: true,
                  gender: true,
                  year: true,
                  major: true,
                  photos: { orderBy: { sortOrder: "asc" }, select: { id: true, storageKey: true } },
                  promptAnswers: {
                    orderBy: { sortOrder: "asc" },
                    select: { id: true, answer: true, prompt: { select: { textKo: true, textEn: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const allReasons = batches.flatMap((b) => b.items.map((i) => i.reasons as unknown as Explanation[]));
  const labelMaps = await buildLabelMaps(db, allReasons);

  const results: IntentPicks[] = [];
  for (const batch of batches) {
    const items: PickCardData[] = [];
    for (const item of batch.items) {
      if (!item.candidate.profile) continue; // shouldn't happen (candidates are always profile-complete), but never render a card with nothing to show
      const photos = await Promise.all(
        item.candidate.profile.photos.map(async (p) => ({ id: p.id, url: await resolvePhotoUrl(p.storageKey) })),
      );
      items.push({
        batchItemId: item.id,
        candidateUserId: item.candidateUserId,
        firstName: item.candidate.profile.firstName,
        gender: item.candidate.profile.gender,
        year: item.candidate.profile.year,
        major: item.candidate.profile.major,
        photos,
        prompts: item.candidate.profile.promptAnswers.map((a) => ({
          id: a.id,
          textKo: a.prompt.textKo,
          textEn: a.prompt.textEn,
          answer: a.answer,
        })),
        reasons: resolveReasons(item.reasons as unknown as Explanation[], labelMaps, locale),
      });
    }
    results.push({ intent: batch.intent, items });
  }
  return results;
}
