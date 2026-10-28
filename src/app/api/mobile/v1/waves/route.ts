import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { WAVES_LIST_RATE_LIMIT, wavesListHandler } from "@/server/mobile/waves";
import { getIncomingWaves } from "@/server/waves/queries";

/** Pending waves sent to you, most recent first. Same data and rules as the website's "Waved at you" inbox. */
export const GET = mobileRoute(
  "waves.list",
  (context) =>
    wavesListHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, WAVES_LIST_RATE_LIMIT),
      getIncomingWaves: (userId) => getIncomingWaves(prisma, userId),
    }),
  { requireAccountSetup: true },
);
