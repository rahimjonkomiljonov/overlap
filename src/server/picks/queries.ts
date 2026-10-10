import type { Gender, IntentMode } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { ensureTodaysBatchForUser, type RunDailyBatchDb } from "@/server/matching/run-daily-batch";
import { effectiveIntents } from "@/server/matching/intents";
import { seoulCalendarDate } from "@/server/matching/seoul-date";
import type { Explanation } from "@/server/matching/explain";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { getBlockedUserIdSet } from "@/server/waves/blocks";
import { buildLabelMaps, resolveReasons, type ResolvedReason } from "./reasons";

export type PicksDb = RunDailyBatchDb &
  Pick<PrismaClient, "profile" | "course" | "club" | "interestTag" | "block" | "hideRule">;

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
  /** C8: the viewer passed this person once before for this intent; this is their one return. */
  secondChance: boolean;
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
  const profile = await db.profile.findUnique({
    where: { userId: actor.userId },
    select: { intents: true, interestedIn: true },
  });
  if (!profile || profile.intents.length === 0) return [];

  // "Open to anything" shows up as Friends and Study (and Dating, with the consent).
  const intents = effectiveIntents(profile.intents, { hasDatingPreference: profile.interestedIn !== null });

  for (const intent of intents) {
    await ensureTodaysBatchForUser(db, actor.userId, actor.campusId, intent, { now });
  }

  const batchDate = seoulCalendarDate(now);
  const batches = await db.dailyBatch.findMany({
    where: { userId: actor.userId, intent: { in: intents }, batchDate },
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

  // Composition time (src/server/matching/candidates.ts) already excludes blocked/hidden
  // pairs from a *new* batch, but a block or hide-from made after today's batch was
  // already persisted must still hide that candidate here — re-checked at read time,
  // same as waves/matches/chat do for blocks.
  const [blocked, hideRules] = await Promise.all([
    getBlockedUserIdSet(db, actor.userId),
    db.hideRule.findMany({ where: { userId: actor.userId }, select: { hiddenUserId: true } }),
  ]);
  const hidden = new Set(hideRules.map((h) => h.hiddenUserId));

  // C8: anyone the viewer passed in an earlier batch for the same intent is back on a
  // second chance (candidates.ts never brings someone back after a second pass).
  const shownIds = batches.flatMap((b) => b.items.map((i) => i.candidateUserId));
  const earlierPasses =
    shownIds.length === 0
      ? []
      : await db.dailyBatch.findMany({
          where: {
            userId: actor.userId,
            intent: { in: intents },
            batchDate: { lt: batchDate },
            items: { some: { decision: "PASSED", candidateUserId: { in: shownIds } } },
          },
          select: {
            intent: true,
            items: {
              where: { decision: "PASSED", candidateUserId: { in: shownIds } },
              select: { candidateUserId: true },
            },
          },
        });
  const passedBefore = new Set(
    earlierPasses.flatMap((b) => b.items.map((i) => `${b.intent}:${i.candidateUserId}`)),
  );

  const results: IntentPicks[] = [];
  for (const batch of batches) {
    const items: PickCardData[] = [];
    for (const item of batch.items) {
      if (blocked.has(item.candidateUserId) || hidden.has(item.candidateUserId)) continue;
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
        secondChance: passedBefore.has(`${batch.intent}:${item.candidateUserId}`),
      });
    }
    results.push({ intent: batch.intent, items });
  }
  return results;
}
