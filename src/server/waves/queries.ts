import type { PrismaClient } from "@/generated/prisma/client";
import { resolvePhotoUrl } from "@/server/storage/photos";
import type { TargetElement } from "@/server/picks/schema";
import { getActiveMeetups, type ActiveMeetupSummary } from "@/server/meetup/summary";
import { getBlockedUserIdSet } from "./blocks";

export type WavesDb = Pick<PrismaClient, "wave" | "match" | "block" | "meetProposal">;

export interface IncomingWave {
  waveId: string;
  fromUserId: string;
  firstName: string | null;
  photoUrl: string | null;
  note: string | null;
  targetElement: TargetElement;
  createdAt: Date;
}

/**
 * Pending waves sent to `userId`, most recent first — the "Waved at you" inbox (D1).
 * Excludes anyone `userId` has blocked or been blocked by (G2), even though a block
 * created after the wave was sent means the row itself is still PENDING in the DB.
 */
export async function getIncomingWaves(db: WavesDb, userId: string): Promise<IncomingWave[]> {
  const blocked = await getBlockedUserIdSet(db, userId);
  const waves = await db.wave.findMany({
    where: { toUserId: userId, status: "PENDING", fromUserId: { notIn: [...blocked] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fromUserId: true,
      note: true,
      targetElement: true,
      createdAt: true,
      fromUser: {
        select: {
          profile: {
            select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } },
          },
        },
      },
    },
  });

  return Promise.all(
    waves.map(async (wave) => {
      const photo = wave.fromUser.profile?.photos[0];
      return {
        waveId: wave.id,
        fromUserId: wave.fromUserId,
        firstName: wave.fromUser.profile?.firstName ?? null,
        photoUrl: photo ? await resolvePhotoUrl(photo.storageKey) : null,
        note: wave.note,
        targetElement: wave.targetElement as unknown as TargetElement,
        createdAt: wave.createdAt,
      };
    }),
  );
}

export interface MatchSummary {
  matchId: string;
  /** Every Match has exactly one Conversation (created atomically in formMatch, S15) — never null in practice. */
  conversationId: string | null;
  otherUserId: string;
  firstName: string | null;
  photoUrl: string | null;
  matchedAt: Date;
  /** A meetup waiting for an answer or confirmed and not yet over; null otherwise. */
  meetup: ActiveMeetupSummary | null;
}

/**
 * Active matches involving `userId`, most recent first. Excludes anyone `userId` has
 * blocked or been blocked by (G2) — a block made after the match formed still hides it
 * from both sides, matching the mutual-invisibility guarantee.
 */
export async function getMatches(db: WavesDb, userId: string): Promise<MatchSummary[]> {
  const blocked = await getBlockedUserIdSet(db, userId);
  const matches = await db.match.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { userAId: userId, userBId: { notIn: [...blocked] } },
        { userBId: userId, userAId: { notIn: [...blocked] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      createdAt: true,
      conversation: { select: { id: true } },
      userA: {
        select: {
          profile: {
            select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } },
          },
        },
      },
      userB: {
        select: {
          profile: {
            select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } },
          },
        },
      },
    },
  });

  const meetups = await getActiveMeetups(db, matches.map((m) => m.id));

  return Promise.all(
    matches.map(async (match) => {
      const isUserA = match.userAId === userId;
      const other = isUserA ? match.userB : match.userA;
      const otherUserId = isUserA ? match.userBId : match.userAId;
      const photo = other.profile?.photos[0];
      return {
        matchId: match.id,
        conversationId: match.conversation?.id ?? null,
        otherUserId,
        firstName: other.profile?.firstName ?? null,
        photoUrl: photo ? await resolvePhotoUrl(photo.storageKey) : null,
        matchedAt: match.createdAt,
        meetup: meetups.get(match.id) ?? null,
      };
    }),
  );
}
