import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, hideClubHandler } from "@/server/mobile/safety";
import { hideByClubStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Hide everyone currently in one of your clubs (one rule per person). */
export const POST = mobileRoute(
  "hides.club",
  (context) =>
    hideClubHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      hide: (person, clubId) => hideByClubStep(prisma, person, clubId),
    }),
  { requireAccountSetup: true },
);
