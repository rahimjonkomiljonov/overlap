import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { PICKS_RATE_LIMIT, picksHandler } from "@/server/mobile/picks";
import { getPicksForActor } from "@/server/picks/queries";

/** Today's picks, with the reasons you overlap. Same data, same rules and same batch as the website's /picks. */
export const GET = mobileRoute(
  "picks.list",
  (context) =>
    picksHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PICKS_RATE_LIMIT),
      isProfileComplete: async (userId) => {
        const profile = await prisma.profile.findUnique({
          where: { userId },
          select: { completedAt: true },
        });
        return profile?.completedAt != null;
      },
      getPicks: (person, locale) => getPicksForActor(prisma, person, locale),
    }),
  { requireAccountSetup: true },
);
