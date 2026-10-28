import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { POCKETS_RATE_LIMIT, pocketsListHandler } from "@/server/mobile/pockets";
import { getMyPockets } from "@/server/pockets/queries";

/** The viewer's own course and club pockets, with how many people are in each. Same data and rules as the website's /pockets. */
export const GET = mobileRoute(
  "pockets.list",
  (context) =>
    pocketsListHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, POCKETS_RATE_LIMIT),
      getMyPockets: (person, locale) =>
        getMyPockets(prisma, { userId: person.userId, campusId: person.campusId }, locale),
    }),
  { requireAccountSetup: true },
);
