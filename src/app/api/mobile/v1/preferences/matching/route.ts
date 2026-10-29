import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { PRIVACY_READ_RATE_LIMIT, PRIVACY_WRITE_RATE_LIMIT, matchingPreferencesHandler, setMatchingPreferencesHandler } from "@/server/mobile/privacy";
import { mobileRoute } from "@/server/mobile/route";
import { getMyWeightSliders } from "@/server/preferences/queries";
import { setWeightSlidersStep } from "@/server/preferences/service";

/** The three "what matters to me" sliders (classes, interests, free time) and the range they accept. */
export const GET = mobileRoute(
  "preferences.matching",
  (context) =>
    matchingPreferencesHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PRIVACY_READ_RATE_LIMIT),
      getSliders: (userId) => getMyWeightSliders(prisma, userId),
    }),
  { requireAccountSetup: true },
);

/** Save the sliders. They apply from the next daily batch. */
export const PUT = mobileRoute(
  "preferences.setMatching",
  (context) =>
    setMatchingPreferencesHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PRIVACY_WRITE_RATE_LIMIT),
      setSliders: (person, sliders) => setWeightSlidersStep(prisma, person, sliders),
    }),
  { requireAccountSetup: true },
);
