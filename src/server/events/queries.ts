import type { PrismaClient } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { CONNECT_WINDOW_MS, eventPhase, rankByOverlap, type EventPhase } from "./rules";

export type EventsDb = Pick<
  PrismaClient,
  "event" | "eventRsvp" | "eventConnect" | "user" | "block" | "hideRule" | "match"
>;

export type EventListItem = {
  id: string;
  title: string;
  spotName: string;
  startsAt: Date;
  endsAt: Date;
  phase: EventPhase;
  goingCount: number;
  capacity: number | null;
  imGoing: boolean;
};

/** Upcoming and ongoing events on the viewer's campus, plus ones still in their connect window. */
export async function listEvents(
  db: EventsDb,
  viewer: { userId: string; campusId: string },
  now: Date = new Date(),
): Promise<EventListItem[]> {
  const events = await db.event.findMany({
    where: {
      campusId: viewer.campusId,
      cancelledAt: null,
      endsAt: { gt: new Date(now.getTime() - CONNECT_WINDOW_MS) },
    },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      cancelledAt: true,
      capacity: true,
      spot: { select: { name: true } },
      _count: { select: { rsvps: true } },
      rsvps: { where: { userId: viewer.userId }, select: { id: true } },
    },
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    spotName: e.spot.name,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    phase: eventPhase(e, now),
    goingCount: e._count.rsvps,
    capacity: e.capacity,
    imGoing: e.rsvps.length > 0,
  }));
}

export type Guest = {
  userId: string;
  firstName: string | null;
  photoUrl: string | null;
  overlap: number;
  /** F3: the viewer already picked this person in the connect window. */
  connected: boolean;
  /** The two already have a Match (from waves or a mutual connect). */
  matched: boolean;
};

export type EventDetail = {
  id: string;
  title: string;
  description: string;
  spotName: string;
  organizerFirstName: string | null;
  startsAt: Date;
  endsAt: Date;
  phase: EventPhase;
  goingCount: number;
  capacity: number | null;
  myRsvp: { showInGuestList: boolean } | null;
  viewerVerified: boolean;
  /** F2: opted-in guests only, safety-filtered, most overlap first. Empty for unverified viewers. */
  guests: Guest[];
};

/**
 * One event for a viewer on the same campus, or null (doesn't exist, other campus). The
 * guest list only ever shows people who opted in for this event, are active, verified
 * and not incognito, and have no block or hide in either direction with the viewer.
 */
export async function getEventDetail(
  db: EventsDb,
  eventId: string,
  viewer: { userId: string; campusId: string },
  now: Date = new Date(),
): Promise<EventDetail | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      campusId: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      cancelledAt: true,
      capacity: true,
      spot: { select: { name: true } },
      organizer: { select: { profile: { select: { firstName: true } } } },
      _count: { select: { rsvps: true } },
    },
  });
  if (!event || event.campusId !== viewer.campusId) return null;

  const [me, myRsvp] = await Promise.all([
    db.user.findUnique({
      where: { id: viewer.userId },
      select: {
        verifiedAt: true,
        profile: {
          select: {
            courses: { select: { courseId: true } },
            clubs: { select: { clubId: true } },
            interests: { select: { interestTagId: true } },
          },
        },
      },
    }),
    db.eventRsvp.findUnique({
      where: { eventId_userId: { eventId, userId: viewer.userId } },
      select: { showInGuestList: true },
    }),
  ]);
  const viewerVerified = me?.verifiedAt != null;

  const detail: EventDetail = {
    id: event.id,
    title: event.title,
    description: event.description,
    spotName: event.spot.name,
    organizerFirstName: event.organizer.profile?.firstName ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    phase: eventPhase(event, now),
    goingCount: event._count.rsvps,
    capacity: event.capacity,
    myRsvp,
    viewerVerified,
    guests: [],
  };
  if (!viewerVerified) return detail;

  const rsvps = await db.eventRsvp.findMany({
    where: {
      eventId,
      showInGuestList: true,
      userId: { not: viewer.userId },
      user: {
        status: UserStatus.ACTIVE,
        verifiedAt: { not: null },
        profile: { completedAt: { not: null }, incognito: false },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      user: {
        select: {
          profile: {
            select: {
              firstName: true,
              photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } },
              courses: { select: { courseId: true } },
              clubs: { select: { clubId: true } },
              interests: { select: { interestTagId: true } },
            },
          },
        },
      },
    },
  });
  const guestIds = rsvps.map((r) => r.userId);
  if (guestIds.length === 0) return detail;

  const [blocks, hides, myConnects, matches] = await Promise.all([
    db.block.findMany({
      where: {
        OR: [
          { blockerId: viewer.userId, blockedId: { in: guestIds } },
          { blockedId: viewer.userId, blockerId: { in: guestIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    db.hideRule.findMany({
      where: {
        OR: [
          { userId: viewer.userId, hiddenUserId: { in: guestIds } },
          { hiddenUserId: viewer.userId, userId: { in: guestIds } },
        ],
      },
      select: { userId: true, hiddenUserId: true },
    }),
    db.eventConnect.findMany({
      where: { eventId, fromUserId: viewer.userId },
      select: { toUserId: true },
    }),
    db.match.findMany({
      where: {
        OR: [
          { userAId: viewer.userId, userBId: { in: guestIds } },
          { userBId: viewer.userId, userAId: { in: guestIds } },
        ],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);
  const other = (a: string, b: string) => (a === viewer.userId ? b : a);
  const excluded = new Set([
    ...blocks.map((b) => other(b.blockerId, b.blockedId)),
    ...hides.map((h) => other(h.userId, h.hiddenUserId)),
  ]);
  const connected = new Set(myConnects.map((c) => c.toUserId));
  const matched = new Set(matches.map((m) => other(m.userAId, m.userBId)));

  const viewerProfile = {
    userId: viewer.userId,
    courseIds: me?.profile?.courses.map((c) => c.courseId) ?? [],
    clubIds: me?.profile?.clubs.map((c) => c.clubId) ?? [],
    interestTagIds: me?.profile?.interests.map((i) => i.interestTagId) ?? [],
  };
  const candidates = rsvps
    .filter((r) => !excluded.has(r.userId) && r.user.profile)
    .map((r) => {
      const p = r.user.profile!;
      return {
        userId: r.userId,
        firstName: p.firstName,
        photoKey: p.photos[0]?.storageKey ?? null,
        courseIds: p.courses.map((c) => c.courseId),
        clubIds: p.clubs.map((c) => c.clubId),
        interestTagIds: p.interests.map((i) => i.interestTagId),
      };
    });

  detail.guests = await Promise.all(
    rankByOverlap(viewerProfile, candidates).map(async (g) => ({
      userId: g.userId,
      firstName: g.firstName,
      photoUrl: g.photoKey ? await resolvePhotoUrl(g.photoKey) : null,
      overlap: g.overlap,
      connected: connected.has(g.userId),
      matched: matched.has(g.userId),
    })),
  );
  return detail;
}

/** Safe spots on the campus, for the organizer's location picker. */
export async function listSafeSpots(
  db: Pick<PrismaClient, "spot">,
  campusId: string,
): Promise<{ id: string; name: string }[]> {
  return db.spot.findMany({
    where: { campusId, isSafeSpot: true, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
