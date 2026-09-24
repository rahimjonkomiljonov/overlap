import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeQuery } from "./normalize";

export type SearchDb = Pick<PrismaClient, "course" | "club" | "spot" | "interestTag">;

const MAX_RESULTS = 20;
const MIN_QUERY_LENGTH = 1;

export type CourseResult = { id: string; code: string; title: string; titleEn: string | null };
export type ClubResult = { id: string; name: string; nameEn: string | null; category: string | null };
export type SpotResult = { id: string; name: string; nameEn: string | null; kind: string };
export type InterestResult = { id: string; slug: string; labelKo: string; labelEn: string; category: string };

/**
 * Autocomplete for course pick (B4), scoped to one campus and term. Backed by the
 * trigram index on `searchText` (prisma/schema.prisma S06), so this is a `contains`
 * query, not a full table scan.
 */
export async function searchCourses(
  db: SearchDb,
  params: { campusId: string; term: string; query: string },
): Promise<CourseResult[]> {
  const q = normalizeQuery(params.query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  return db.course.findMany({
    where: { campusId: params.campusId, term: params.term, active: true, searchText: { contains: q } },
    select: { id: true, code: true, title: true, titleEn: true },
    orderBy: { code: "asc" },
    take: MAX_RESULTS,
  });
}

/** Autocomplete for club pick (B5), scoped to one campus. */
export async function searchClubs(
  db: SearchDb,
  params: { campusId: string; query: string },
): Promise<ClubResult[]> {
  const q = normalizeQuery(params.query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  return db.club.findMany({
    where: { campusId: params.campusId, active: true, searchText: { contains: q } },
    select: { id: true, name: true, nameEn: true, category: true },
    orderBy: { name: "asc" },
    take: MAX_RESULTS,
  });
}

/** Autocomplete for hangout-spot pick (B6), scoped to one campus. */
export async function searchSpots(
  db: SearchDb,
  params: { campusId: string; query: string },
): Promise<SpotResult[]> {
  const q = normalizeQuery(params.query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  return db.spot.findMany({
    where: { campusId: params.campusId, active: true, searchText: { contains: q } },
    select: { id: true, name: true, nameEn: true, kind: true },
    orderBy: { name: "asc" },
    take: MAX_RESULTS,
  });
}

/** Autocomplete for interest tags (B8) — shared across campuses, not campus-scoped. */
export async function searchInterests(db: SearchDb, params: { query: string }): Promise<InterestResult[]> {
  const q = normalizeQuery(params.query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  return db.interestTag.findMany({
    where: { active: true, searchText: { contains: q } },
    select: { id: true, slug: true, labelKo: true, labelEn: true, category: true },
    orderBy: { labelKo: "asc" },
    take: MAX_RESULTS,
  });
}
