import type { PrismaClient } from "@/generated/prisma/client";
import { UserStatus } from "@/generated/prisma/enums";
import { shareBucket } from "./buckets";

export interface ShareableGroup {
  kind: "course" | "club";
  id: string;
  label: string;
  /** The "N+" for the card, or null when the group is too small to share. */
  bucket: number | null;
}

export type ShareDb = Pick<PrismaClient, "profile" | "course" | "club" | "profileCourse" | "profileClub">;

/** Someone "on Overlap" for a card: a finished, visible profile on an active, verified account. */
function countedProfile(campusId: string) {
  return {
    completedAt: { not: null },
    incognito: false,
    user: { campusId, status: UserStatus.ACTIVE, verifiedAt: { not: null } },
  };
}

/**
 * J5: the viewer's own courses and clubs with a bucketed count of people on Overlap in
 * each. Only the viewer's own groups, only same-campus rows, and only aggregate counts.
 */
export async function getShareableGroups(
  db: ShareDb,
  viewer: { userId: string; campusId: string },
  locale: string,
): Promise<ShareableGroup[]> {
  const profile = await db.profile.findUnique({
    where: { userId: viewer.userId },
    select: { courses: { select: { courseId: true } }, clubs: { select: { clubId: true } } },
  });
  if (!profile) return [];
  const courseIds = [...new Set(profile.courses.map((c) => c.courseId))];
  const clubIds = [...new Set(profile.clubs.map((c) => c.clubId))];

  const [courses, clubs, courseCounts, clubCounts] = await Promise.all([
    db.course.findMany({
      where: { id: { in: courseIds }, campusId: viewer.campusId },
      orderBy: { code: "asc" },
      select: { id: true, title: true, titleEn: true },
    }),
    db.club.findMany({
      where: { id: { in: clubIds }, campusId: viewer.campusId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true },
    }),
    db.profileCourse.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, profile: countedProfile(viewer.campusId) },
      _count: { _all: true },
    }),
    db.profileClub.groupBy({
      by: ["clubId"],
      where: { clubId: { in: clubIds }, profile: countedProfile(viewer.campusId) },
      _count: { _all: true },
    }),
  ]);

  const courseCount = new Map(courseCounts.map((r) => [r.courseId, r._count._all]));
  const clubCount = new Map(clubCounts.map((r) => [r.clubId, r._count._all]));
  const en = locale === "en";

  return [
    ...courses.map((c) => ({
      kind: "course" as const,
      id: c.id,
      label: en && c.titleEn ? c.titleEn : c.title,
      bucket: shareBucket(courseCount.get(c.id) ?? 0),
    })),
    ...clubs.map((c) => ({
      kind: "club" as const,
      id: c.id,
      label: en && c.nameEn ? c.nameEn : c.name,
      bucket: shareBucket(clubCount.get(c.id) ?? 0),
    })),
  ];
}
