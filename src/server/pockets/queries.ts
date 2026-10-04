import type { PrismaClient } from "@/generated/prisma/client";
import { IntentMode, UserStatus } from "@/generated/prisma/enums";
import { intersectDeduped } from "@/server/matching/terms";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { compatiblePocketIntents, POCKET_INTENTS, type PocketKind } from "./rules";

export type PocketsDb = Pick<
  PrismaClient,
  "user" | "profile" | "course" | "club" | "block" | "hideRule" | "wave" | "match"
>;

type Viewer = { userId: string; campusId: string };

export type PocketsViewer = {
  verified: boolean;
  visible: boolean;
  /** The viewer has at least one Friends/Study/Open intent; Dating-only users have no pockets. */
  hasPocketIntent: boolean;
};

type ViewerProfile = {
  intents: IntentMode[];
  courseIds: string[];
  clubIds: string[];
};

async function loadViewer(
  db: PocketsDb,
  viewer: Viewer,
): Promise<{ state: PocketsViewer; profile: ViewerProfile } | null> {
  const user = await db.user.findUnique({
    where: { id: viewer.userId },
    select: {
      verifiedAt: true,
      profile: {
        select: {
          pocketsVisible: true,
          intents: true,
          courses: { select: { courseId: true } },
          clubs: { select: { clubId: true } },
        },
      },
    },
  });
  if (!user?.profile) return null;
  const intents = user.profile.intents;
  return {
    state: {
      verified: user.verifiedAt !== null,
      visible: user.profile.pocketsVisible,
      hasPocketIntent: intents.some((i) => POCKET_INTENTS.includes(i)),
    },
    profile: {
      intents,
      courseIds: user.profile.courses.map((c) => c.courseId),
      clubIds: user.profile.clubs.map((c) => c.clubId),
    },
  };
}

/** Pockets are reciprocal: only a verified, visible viewer with a pocket intent sees anyone. */
function canBrowse(state: PocketsViewer): boolean {
  return state.verified && state.visible && state.hasPocketIntent;
}

type Member = {
  userId: string;
  firstName: string | null;
  year: number | null;
  photoKey: string | null;
  intents: IntentMode[];
  courseIds: string[];
  clubIds: string[];
};

/**
 * Everyone who could appear to this viewer in any of the given pockets. A member must
 * have opted in, be on the same campus, active, verified, done with onboarding and not
 * incognito, share a Friends/Study/Open intent with the viewer, and have no block or
 * hide with the viewer in either direction. This is the one place those rules live:
 * the pocket pages and the wave action both go through it.
 */
async function loadMembers(
  db: PocketsDb,
  viewer: Viewer,
  viewerProfile: ViewerProfile,
  pockets: { courseIds: string[]; clubIds: string[] },
): Promise<Member[]> {
  if (pockets.courseIds.length === 0 && pockets.clubIds.length === 0) return [];
  const profiles = await db.profile.findMany({
    where: {
      pocketsVisible: true,
      incognito: false,
      completedAt: { not: null },
      userId: { not: viewer.userId },
      user: { campusId: viewer.campusId, status: UserStatus.ACTIVE, verifiedAt: { not: null } },
      OR: [
        { courses: { some: { courseId: { in: pockets.courseIds } } } },
        { clubs: { some: { clubId: { in: pockets.clubIds } } } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      userId: true,
      firstName: true,
      year: true,
      intents: true,
      photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } },
      courses: { select: { courseId: true } },
      clubs: { select: { clubId: true } },
    },
  });
  const ids = profiles.map((p) => p.userId);
  if (ids.length === 0) return [];

  const [blocks, hides] = await Promise.all([
    db.block.findMany({
      where: {
        OR: [
          { blockerId: viewer.userId, blockedId: { in: ids } },
          { blockedId: viewer.userId, blockerId: { in: ids } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    db.hideRule.findMany({
      where: {
        OR: [
          { userId: viewer.userId, hiddenUserId: { in: ids } },
          { hiddenUserId: viewer.userId, userId: { in: ids } },
        ],
      },
      select: { userId: true, hiddenUserId: true },
    }),
  ]);
  const other = (a: string, b: string) => (a === viewer.userId ? b : a);
  const excluded = new Set([
    ...blocks.map((b) => other(b.blockerId, b.blockedId)),
    ...hides.map((h) => other(h.userId, h.hiddenUserId)),
  ]);

  return profiles
    .filter((p) => !excluded.has(p.userId))
    .map((p) => ({
      userId: p.userId,
      firstName: p.firstName,
      year: p.year,
      photoKey: p.photos[0]?.storageKey ?? null,
      intents: compatiblePocketIntents(viewerProfile.intents, p.intents),
      courseIds: p.courses.map((c) => c.courseId),
      clubIds: p.clubs.map((c) => c.clubId),
    }))
    .filter((m) => m.intents.length > 0);
}

export type PocketSummary = { kind: PocketKind; id: string; label: string; memberCount: number };

export type MyPockets = PocketsViewer & { pockets: PocketSummary[] };

function courseLabel(c: { code: string; title: string; titleEn: string | null }, locale: string) {
  return `${c.code} · ${locale === "en" && c.titleEn ? c.titleEn : c.title}`;
}

function clubLabel(c: { name: string; nameEn: string | null }, locale: string) {
  return locale === "en" && c.nameEn ? c.nameEn : c.name;
}

/** The viewer's own courses and clubs, each with how many people the viewer could meet there. */
export async function getMyPockets(db: PocketsDb, viewer: Viewer, locale: string): Promise<MyPockets> {
  const loaded = await loadViewer(db, viewer);
  if (!loaded) return { verified: false, visible: false, hasPocketIntent: false, pockets: [] };
  const { state, profile } = loaded;

  const [courses, clubs] = await Promise.all([
    db.course.findMany({
      where: { id: { in: profile.courseIds }, campusId: viewer.campusId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true, titleEn: true },
    }),
    db.club.findMany({
      where: { id: { in: profile.clubIds }, campusId: viewer.campusId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true },
    }),
  ]);

  const members = canBrowse(state)
    ? await loadMembers(db, viewer, profile, {
        courseIds: courses.map((c) => c.id),
        clubIds: clubs.map((c) => c.id),
      })
    : [];
  const countIn = (kind: PocketKind, id: string) =>
    members.filter((m) => (kind === "course" ? m.courseIds : m.clubIds).includes(id)).length;

  return {
    ...state,
    pockets: [
      ...courses.map((c) => ({
        kind: "course" as const,
        id: c.id,
        label: courseLabel(c, locale),
        memberCount: countIn("course", c.id),
      })),
      ...clubs.map((c) => ({
        kind: "club" as const,
        id: c.id,
        label: clubLabel(c, locale),
        memberCount: countIn("club", c.id),
      })),
    ],
  };
}

export type PocketMember = {
  userId: string;
  firstName: string | null;
  year: number | null;
  photoUrl: string | null;
  intents: IntentMode[];
  /** Other courses and clubs shared with the viewer, beyond this pocket itself. */
  alsoShared: number;
  waved: boolean;
  matched: boolean;
};

export type PocketDetail = PocketsViewer & { label: string; members: PocketMember[] };

/**
 * One pocket the viewer belongs to, or null (not the viewer's course/club, other campus).
 * Members are listed in join order, not ranked: Pockets is the non-algorithmic route.
 */
export async function getPocket(
  db: PocketsDb,
  viewer: Viewer,
  kind: PocketKind,
  pocketId: string,
  locale: string,
): Promise<PocketDetail | null> {
  const loaded = await loadViewer(db, viewer);
  if (!loaded) return null;
  const { state, profile } = loaded;

  const mine = kind === "course" ? profile.courseIds : profile.clubIds;
  if (!mine.includes(pocketId)) return null;
  let label: string;
  if (kind === "course") {
    const course = await db.course.findFirst({
      where: { id: pocketId, campusId: viewer.campusId },
      select: { code: true, title: true, titleEn: true },
    });
    if (!course) return null;
    label = courseLabel(course, locale);
  } else {
    const club = await db.club.findFirst({
      where: { id: pocketId, campusId: viewer.campusId },
      select: { name: true, nameEn: true },
    });
    if (!club) return null;
    label = clubLabel(club, locale);
  }

  if (!canBrowse(state)) return { ...state, label, members: [] };

  const members = await loadMembers(
    db,
    viewer,
    profile,
    kind === "course" ? { courseIds: [pocketId], clubIds: [] } : { courseIds: [], clubIds: [pocketId] },
  );
  const ids = members.map((m) => m.userId);
  const [waves, matches] = ids.length
    ? await Promise.all([
        db.wave.findMany({
          where: { fromUserId: viewer.userId, toUserId: { in: ids } },
          select: { toUserId: true },
        }),
        db.match.findMany({
          where: {
            OR: [
              { userAId: viewer.userId, userBId: { in: ids } },
              { userBId: viewer.userId, userAId: { in: ids } },
            ],
          },
          select: { userAId: true, userBId: true },
        }),
      ])
    : [[], []];
  const waved = new Set(waves.map((w) => w.toUserId));
  const matched = new Set(matches.map((m) => (m.userAId === viewer.userId ? m.userBId : m.userAId)));

  const shared = (m: Member) =>
    intersectDeduped(profile.courseIds, m.courseIds).length +
    intersectDeduped(profile.clubIds, m.clubIds).length -
    1;

  return {
    ...state,
    label,
    members: await Promise.all(
      members.map(async (m) => ({
        userId: m.userId,
        firstName: m.firstName,
        year: m.year,
        photoUrl: m.photoKey ? await resolvePhotoUrl(m.photoKey) : null,
        intents: m.intents,
        alsoShared: Math.max(0, shared(m)),
        waved: waved.has(m.userId),
        matched: matched.has(m.userId),
      })),
    ),
  };
}

/** Whether `targetUserId` is someone the viewer can currently see in this pocket; the wave action's gate. */
export async function isPocketMember(
  db: PocketsDb,
  viewer: Viewer,
  kind: PocketKind,
  pocketId: string,
  targetUserId: string,
): Promise<boolean> {
  const loaded = await loadViewer(db, viewer);
  if (!loaded || !canBrowse(loaded.state)) return false;
  const mine = kind === "course" ? loaded.profile.courseIds : loaded.profile.clubIds;
  if (!mine.includes(pocketId)) return false;
  const members = await loadMembers(
    db,
    viewer,
    loaded.profile,
    kind === "course" ? { courseIds: [pocketId], clubIds: [] } : { courseIds: [], clubIds: [pocketId] },
  );
  return members.some((m) => m.userId === targetUserId);
}
