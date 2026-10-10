import type { PrismaClient } from "@/generated/prisma/client";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { isBlockedEitherWay } from "@/server/waves/blocks";

export type MatchedProfileDb = Pick<PrismaClient, "match" | "profile" | "block">;

export interface MatchedProfileView {
  userId: string;
  firstName: string | null;
  year: number | null;
  major: string | null;
  photos: { id: string; url: string }[];
  prompts: { id: string; textKo: string; textEn: string; answer: string }[];
  interests: { id: string; labelKo: string; labelEn: string }[];
  /** For the "go to the chat / plan a meetup" links back. */
  matchId: string;
  conversationId: string | null;
}

/**
 * Another person's profile, for someone they are matched with. Returns null (never a
 * reason) unless there is an ACTIVE match between the two and neither has blocked the
 * other, so a guessed id can't be used to read anyone's profile.
 *
 * Deliberately shows only what a pick card already shows plus their prompts and interest
 * tags. Never free time, the values quiz answers, matching weights, "who I'd like to
 * meet" or anything else from the profile that is private to the person.
 */
export async function getMatchedProfile(
  db: MatchedProfileDb,
  viewerId: string,
  otherUserId: string,
): Promise<MatchedProfileView | null> {
  if (viewerId === otherUserId) return null;

  const match = await db.match.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userAId: viewerId, userBId: otherUserId },
        { userAId: otherUserId, userBId: viewerId },
      ],
    },
    select: { id: true, conversation: { select: { id: true } } },
  });
  if (!match) return null;
  if (await isBlockedEitherWay(db, viewerId, otherUserId)) return null;

  const profile = await db.profile.findUnique({
    where: { userId: otherUserId },
    select: {
      firstName: true,
      year: true,
      major: true,
      photos: { orderBy: { sortOrder: "asc" }, select: { id: true, storageKey: true } },
      promptAnswers: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, answer: true, prompt: { select: { textKo: true, textEn: true } } },
      },
      interests: { select: { interestTag: { select: { id: true, labelKo: true, labelEn: true } } } },
    },
  });
  if (!profile) return null;

  return {
    userId: otherUserId,
    firstName: profile.firstName,
    year: profile.year,
    major: profile.major,
    photos: await Promise.all(profile.photos.map(async (p) => ({ id: p.id, url: await resolvePhotoUrl(p.storageKey) }))),
    prompts: profile.promptAnswers.map((a) => ({
      id: a.id,
      textKo: a.prompt.textKo,
      textEn: a.prompt.textEn,
      answer: a.answer,
    })),
    interests: profile.interests.map((i) => i.interestTag),
    matchId: match.id,
    conversationId: match.conversation?.id ?? null,
  };
}
