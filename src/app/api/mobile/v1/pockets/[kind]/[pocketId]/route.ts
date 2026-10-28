import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { pocketDetailHandler } from "@/server/mobile/pockets";
import { getPocket } from "@/server/pockets/queries";

/** One pocket in full: everyone the viewer could meet there. Same data and rules as the website's /pockets/{kind}/{pocketId}. */
export const GET = mobileRoute(
  "pockets.detail",
  (context) =>
    pocketDetailHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, { max: 120, windowMs: 60 * 60 * 1000 }),
      getPocket: (person, kind, pocketId, locale) =>
        getPocket(prisma, { userId: person.userId, campusId: person.campusId }, kind, pocketId, locale),
    }),
  { requireAccountSetup: true },
);
