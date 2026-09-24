import type { PrismaClient } from "@/generated/prisma/client";
import type { Explanation } from "@/server/matching/explain";

export type ReasonLookupDb = Pick<PrismaClient, "course" | "club" | "interestTag">;

export type ResolvedReason =
  | { type: "course" | "club" | "interest"; label: string }
  /** day: 0-6 (Mon-Sun), block: 0-11 (2-hour block) — same encoding as ProfileOnboarding's freeTime.days/blocks arrays. */
  | { type: "freeTime"; day: number; block: number }
  | { type: "values" };

interface LabelMaps {
  courses: Map<string, { title: string; titleEn: string | null }>;
  clubs: Map<string, { name: string; nameEn: string | null }>;
  interests: Map<string, { labelKo: string; labelEn: string }>;
}

/**
 * `BatchItem.reasons` only stores ids (src/server/matching/explain.ts's `Explanation`
 * type, by design — so a locale/copy change never needs a data backfill). Rendering
 * "why you overlap" needs the actual course/club/interest labels, fetched here in one
 * bulk pass across every reason on the page rather than per reason — the same
 * bulk-not-per-row shape as the rest of the matching pipeline (S10/S11).
 */
export async function buildLabelMaps(db: ReasonLookupDb, reasonsList: readonly Explanation[][]): Promise<LabelMaps> {
  const courseIds = new Set<string>();
  const clubIds = new Set<string>();
  const interestIds = new Set<string>();
  for (const reasons of reasonsList) {
    for (const r of reasons) {
      if (r.type === "course") courseIds.add(r.courseId);
      if (r.type === "club") clubIds.add(r.clubId);
      if (r.type === "interest") interestIds.add(r.interestTagId);
    }
  }

  const [courses, clubs, interests] = await Promise.all([
    courseIds.size > 0
      ? db.course.findMany({ where: { id: { in: [...courseIds] } }, select: { id: true, title: true, titleEn: true } })
      : Promise.resolve([]),
    clubIds.size > 0
      ? db.club.findMany({ where: { id: { in: [...clubIds] } }, select: { id: true, name: true, nameEn: true } })
      : Promise.resolve([]),
    interestIds.size > 0
      ? db.interestTag.findMany({
          where: { id: { in: [...interestIds] } },
          select: { id: true, labelKo: true, labelEn: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    courses: new Map(courses.map((c) => [c.id, { title: c.title, titleEn: c.titleEn }])),
    clubs: new Map(clubs.map((c) => [c.id, { name: c.name, nameEn: c.nameEn }])),
    interests: new Map(interests.map((i) => [i.id, { labelKo: i.labelKo, labelEn: i.labelEn }])),
  };
}

/** Pure: turns one `Explanation` into display data, or null if its referenced feature has since been deactivated/removed (never fabricate a label). */
export function resolveReason(explanation: Explanation, maps: LabelMaps, locale: string): ResolvedReason | null {
  const isEnglish = locale === "en";
  switch (explanation.type) {
    case "course": {
      const course = maps.courses.get(explanation.courseId);
      if (!course) return null;
      return { type: "course", label: isEnglish ? (course.titleEn ?? course.title) : course.title };
    }
    case "club": {
      const club = maps.clubs.get(explanation.clubId);
      if (!club) return null;
      return { type: "club", label: isEnglish ? (club.nameEn ?? club.name) : club.name };
    }
    case "interest": {
      const interest = maps.interests.get(explanation.interestTagId);
      if (!interest) return null;
      return { type: "interest", label: isEnglish ? interest.labelEn : interest.labelKo };
    }
    case "freeTime":
      return { type: "freeTime", day: explanation.day, block: explanation.block };
    case "values":
      return { type: "values" };
  }
}

/** Resolves every reason in one list, dropping any that couldn't be resolved. */
export function resolveReasons(reasons: readonly Explanation[], maps: LabelMaps, locale: string): ResolvedReason[] {
  return reasons.map((r) => resolveReason(r, maps, locale)).filter((r): r is ResolvedReason => r !== null);
}
