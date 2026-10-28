import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { matchesListHandler, MATCHES_RATE_LIMIT } from "@/server/mobile/matches";
import { mobileRoute } from "@/server/mobile/route";
import { getMatches } from "@/server/waves/queries";

/** Every active match, most recent first — the chat entry point. Same data as the website's /matches. */
export const GET = mobileRoute(
  "matches.list",
  (context) =>
    matchesListHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MATCHES_RATE_LIMIT),
      getMatches: (userId) => getMatches(prisma, userId),
    }),
  { requireAccountSetup: true },
);
