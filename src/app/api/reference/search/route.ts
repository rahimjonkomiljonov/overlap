import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import {
  searchClubs,
  searchCourses,
  searchInterests,
  searchSpots,
} from "@/server/reference/search";
import { currentTerm } from "@/server/reference/term";

const TYPES = ["course", "club", "spot", "interest"] as const;
type SearchType = (typeof TYPES)[number];

function isSearchType(value: string | null): value is SearchType {
  return TYPES.includes(value as SearchType);
}

/**
 * Reference-data autocomplete (S06/B4/B5/B6/B8). Every route handler checks
 * authorization itself (CLAUDE.md) — signed-in and onboarded (has a campusId) is
 * required for course/club/spot, which are campus-scoped; interests are shared across
 * campuses so only sign-in is required.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const query = url.searchParams.get("q") ?? "";

  if (!isSearchType(type)) {
    return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });
  }

  if (type === "interest") {
    const results = await searchInterests(prisma, { query });
    return NextResponse.json({ results });
  }

  if (!actor.campusId) {
    return NextResponse.json({ error: "NOT_ONBOARDED" }, { status: 403 });
  }

  if (type === "course") {
    const term = url.searchParams.get("term") ?? currentTerm();
    const results = await searchCourses(prisma, { campusId: actor.campusId, term, query });
    return NextResponse.json({ results });
  }
  if (type === "club") {
    const results = await searchClubs(prisma, { campusId: actor.campusId, query });
    return NextResponse.json({ results });
  }
  const results = await searchSpots(prisma, { campusId: actor.campusId, query });
  return NextResponse.json({ results });
}
