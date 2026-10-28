import type { PrismaClient } from "@/generated/prisma/client";
import { getEmergencyContacts, type EmergencyContact } from "@/server/safety/emergency";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { CUSTOM_BLOCKS, customDayStarts } from "./custom";
import {
  getMeetupForMatch,
  getMeetupOptions,
  loadMatchForActor,
  otherUserId,
  type MeetupDb,
  type MeetupOption,
  type MeetupProposalView,
} from "./queries";

export type MeetupScreenDb = MeetupDb & Pick<PrismaClient, "campus" | "spot">;

export interface MeetupScreen {
  matchId: string;
  other: { userId: string; firstName: string | null; photoUrl: string | null };
  /** The live (waiting or confirmed) proposal, or null when there is nothing to answer yet. */
  proposal: MeetupProposalView | null;
  /** Suggested times at Safe Spots from both people's shared free time. Empty when a proposal is already live. */
  options: MeetupOption[];
  /** Every active Safe Spot on the campus, for a custom time. Empty when a proposal is already live. */
  safeSpots: { id: string; name: string; nameEn: string | null }[];
  customDays: Date[];
  customBlocks: readonly number[];
  emergencyContacts: EmergencyContact[];
  now: Date;
}

/**
 * Everything the meetup planner shows in one call — the mobile counterpart of the website's
 * meetup page, which composes the same pieces inline. Null for anything `loadMatchForActor`
 * refuses (not a participant, no such match) and for a match that has since been unmatched.
 */
export async function getMeetupScreen(
  db: MeetupScreenDb,
  person: { userId: string; campusId: string },
  matchId: string,
  now: Date = new Date(),
): Promise<MeetupScreen | null> {
  const match = await loadMatchForActor(db, matchId, person.userId);
  if (!match || match.status !== "ACTIVE") return null;

  const latest = await getMeetupForMatch(db, match, person.userId);
  const proposal = latest && (latest.status === "PROPOSED" || latest.status === "ACCEPTED") ? latest : null;

  const options = proposal ? [] : await getMeetupOptions(db, match, now);
  const safeSpots =
    proposal || !person.campusId
      ? []
      : await db.spot.findMany({
          where: { campusId: person.campusId, isSafeSpot: true, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, nameEn: true },
        });
  const emergencyContacts = person.campusId ? await getEmergencyContacts(db, person.campusId) : [];

  const otherId = otherUserId(match, person.userId);
  const other = await db.user.findUnique({
    where: { id: otherId },
    select: {
      profile: { select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } } },
    },
  });
  const photo = other?.profile?.photos[0];

  return {
    matchId: match.matchId,
    other: {
      userId: otherId,
      firstName: other?.profile?.firstName ?? null,
      photoUrl: photo ? await resolvePhotoUrl(photo.storageKey) : null,
    },
    proposal,
    options,
    safeSpots,
    customDays: customDayStarts(now),
    customBlocks: CUSTOM_BLOCKS,
    emergencyContacts,
    now,
  };
}
