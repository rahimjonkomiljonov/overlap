import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_READ_RATE_LIMIT, safetyScreenHandler } from "@/server/mobile/safety";
import { getSafetyScreen } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** The person's own safety state: pause and incognito, the blocked and hidden lists, actions taken on the account and how to appeal, and the reach-limit status. Open to a restricted account so it can see why. */
export const GET = mobileRoute(
  "safety.screen",
  (context) =>
    safetyScreenHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_READ_RATE_LIMIT),
      getScreen: (person) => getSafetyScreen(prisma, person),
    }),
  { requireAccountSetup: true, allowRestricted: true },
);
