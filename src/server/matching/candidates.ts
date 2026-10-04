import { Gender, IntentMode, PickDecision, UserStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { isCohortReleaseEnabled } from "@/server/cohorts/release";
import { decryptField } from "@/server/privacy/encryption";
import type { WeightSliders } from "./personalize";
import type { MatchableProfile } from "./terms";

export type CandidateDb = Pick<PrismaClient, "user" | "block" | "hideRule" | "dailyBatch">;

/** How far back "active" reaches (REQUIREMENTS.md §5.1/C5: "active in last 14 days"). */
const ACTIVE_WINDOW_DAYS = 14;
/** "not shown to this user in the last 30 days" (§5.1). */
const RECENTLY_SHOWN_WINDOW_DAYS = 30;
/** C8 "second chance": a passed profile may come back once, so a second pass is final. */
const MAX_PASSES_BEFORE_FINAL = 2;

export interface LoadedProfile extends MatchableProfile {
  gender: Gender;
  /** Decrypted only when `intent === DATING` (the only intent that ever filters on it) — null otherwise, always, regardless of whether the user set it. */
  interestedIn: Gender[] | null;
  /** Backs the newcomer composition slot (S11: joined ≤ 7 days ago, REQUIREMENTS.md §5.3/C6). */
  joinedAt: Date;
  /** B11: this user's own "what matters" sliders, applied when they are the viewer. */
  sliders: WeightSliders;
}

export interface CampusMatchPool {
  /** Every eligible (same campus, verified, active, profile-complete, opted into this intent) user — the pool candidates and viewers are both drawn from. */
  profiles: LoadedProfile[];
  /** Normalized both ways: contains `"a:b"` whenever a blocked b OR b blocked a. */
  blockedPairs: ReadonlySet<string>;
  /** One-directional: `hiddenBy.get(userId)` is the set of user ids that `userId` has personally hidden. */
  hiddenBy: ReadonlyMap<string, ReadonlySet<string>>;
  /** `recentlyShown.get(viewerId)` is who viewerId has already seen in a batch for this intent in the last 30 days. */
  recentlyShown: ReadonlyMap<string, ReadonlySet<string>>;
  /** C8: `passedTwice.get(viewerId)` is who viewerId has passed twice for this intent, ever. Never shown again. */
  passedTwice: ReadonlyMap<string, ReadonlySet<string>>;
}

function blockPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * The "SQL candidate generation" half of the pipeline (REQUIREMENTS.md §5.1): one bulk
 * query per concern (eligible profiles, blocks, hides, recent-batch history) for the
 * whole campus+intent, never per-pair — this is what makes scoring every pair for 1,000
 * users finish in well under a minute (S10's own "Done when"): O(1) round trips
 * regardless of pool size, with all O(n²) pairwise work happening in memory afterward in
 * src/server/matching/batch.ts. Gender/preference fit isn't filtered here even for
 * Dating, because `interestedIn` is encrypted at rest and can't be queried in SQL —
 * that hard filter runs in-memory in filters.ts once this is decrypted.
 */
export async function loadCampusMatchPool(
  db: CandidateDb,
  campusId: string,
  intent: IntentMode,
  options: { now?: Date } = {},
): Promise<CampusMatchPool> {
  const now = options.now ?? new Date();
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentlyShownSince = new Date(now.getTime() - RECENTLY_SHOWN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const users = await db.user.findMany({
    where: {
      campusId,
      // G3: paused, suspended, banned or deleted accounts never appear as a candidate to
      // anyone else, on top of the block/hide filters below. Incognito (also G3) is a
      // per-profile opt-in to the same effect while staying otherwise fully active.
      status: UserStatus.ACTIVE,
      verifiedAt: { not: null },
      lastActiveAt: { gte: activeSince },
      profile: { completedAt: { not: null }, intents: { has: intent }, incognito: false },
      // J2: with cohort release on, Dating only matches people whose cohort passed the
      // density gate. Profile intents alone aren't enough: a cohort can close again.
      ...(intent === IntentMode.DATING && isCohortReleaseEnabled()
        ? { cohort: { datingOpen: true } }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
      profile: {
        select: {
          gender: true,
          interestedIn: true,
          freeTimeSlots: true,
          valuesAnswers: true,
          weightClasses: true,
          weightInterests: true,
          weightFreeTime: true,
          courses: { select: { courseId: true, sectionId: true } },
          clubs: { select: { clubId: true } },
          spots: { select: { spotId: true } },
          interests: { select: { interestTagId: true } },
        },
      },
    },
  });

  const profiles: LoadedProfile[] = users
    .filter((u): u is typeof u & { profile: NonNullable<typeof u.profile> } => u.profile !== null)
    .map((u) => ({
      userId: u.id,
      joinedAt: u.createdAt,
      gender: u.profile.gender ?? Gender.OTHER,
      interestedIn:
        intent === IntentMode.DATING && u.profile.interestedIn
          ? (JSON.parse(decryptField(u.profile.interestedIn)) as Gender[])
          : null,
      courses: u.profile.courses,
      clubIds: u.profile.clubs.map((c) => c.clubId),
      spotIds: u.profile.spots.map((s) => s.spotId),
      interestTagIds: u.profile.interests.map((i) => i.interestTagId),
      freeTimeSlots: u.profile.freeTimeSlots,
      valuesAnswers: u.profile.valuesAnswers,
      sliders: {
        classes: u.profile.weightClasses,
        interests: u.profile.weightInterests,
        freeTime: u.profile.weightFreeTime,
      },
    }));

  const userIds = profiles.map((p) => p.userId);
  if (userIds.length === 0) {
    return { profiles: [], blockedPairs: new Set(), hiddenBy: new Map(), recentlyShown: new Map(), passedTwice: new Map() };
  }

  const [blocks, hideRules, recentItems, pastPasses] = await Promise.all([
    db.block.findMany({
      where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
      select: { blockerId: true, blockedId: true },
    }),
    db.hideRule.findMany({ where: { userId: { in: userIds } }, select: { userId: true, hiddenUserId: true } }),
    db.dailyBatch.findMany({
      where: { userId: { in: userIds }, intent, batchDate: { gte: recentlyShownSince } },
      select: { userId: true, items: { select: { candidateUserId: true } } },
    }),
    db.dailyBatch.findMany({
      where: { userId: { in: userIds }, intent, items: { some: { decision: PickDecision.PASSED } } },
      select: { userId: true, items: { where: { decision: PickDecision.PASSED }, select: { candidateUserId: true } } },
    }),
  ]);

  const blockedPairs = new Set(blocks.map((b) => blockPairKey(b.blockerId, b.blockedId)));

  const hiddenBy = new Map<string, Set<string>>();
  for (const rule of hideRules) {
    if (!hiddenBy.has(rule.userId)) hiddenBy.set(rule.userId, new Set());
    hiddenBy.get(rule.userId)!.add(rule.hiddenUserId);
  }

  const recentlyShown = new Map<string, Set<string>>();
  for (const batch of recentItems) {
    if (!recentlyShown.has(batch.userId)) recentlyShown.set(batch.userId, new Set());
    const set = recentlyShown.get(batch.userId)!;
    for (const item of batch.items) set.add(item.candidateUserId);
  }

  const passCounts = new Map<string, Map<string, number>>();
  for (const batch of pastPasses) {
    if (!passCounts.has(batch.userId)) passCounts.set(batch.userId, new Map());
    const counts = passCounts.get(batch.userId)!;
    for (const item of batch.items) counts.set(item.candidateUserId, (counts.get(item.candidateUserId) ?? 0) + 1);
  }
  const passedTwice = new Map<string, Set<string>>();
  for (const [viewerId, counts] of passCounts) {
    const final = [...counts].filter(([, n]) => n >= MAX_PASSES_BEFORE_FINAL).map(([id]) => id);
    if (final.length > 0) passedTwice.set(viewerId, new Set(final));
  }

  return { profiles, blockedPairs, hiddenBy, recentlyShown, passedTwice };
}
