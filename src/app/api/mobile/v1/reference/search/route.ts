import { prisma } from "@/server/db";
import { searchHandler, SEARCH_RATE_LIMIT } from "@/server/mobile/profile-read";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import {
  searchClubs,
  searchCourses,
  searchInterests,
  searchSpots,
} from "@/server/reference/search";
import { currentTerm } from "@/server/reference/term";

/** Search for the pickers: courses, clubs and spots on the caller's own campus, and interests. */
export const GET = mobileRoute(
  "reference.search",
  (context) =>
    searchHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SEARCH_RATE_LIMIT),
      search: async ({ type, q, term, campusId }) => {
        if (type === "interest") return searchInterests(prisma, { query: q });
        if (type === "course")
          return searchCourses(prisma, { campusId, term: term ?? currentTerm(), query: q });
        if (type === "club") return searchClubs(prisma, { campusId, query: q });
        return searchSpots(prisma, { campusId, query: q });
      },
    }),
  { requireAccountSetup: true },
);
