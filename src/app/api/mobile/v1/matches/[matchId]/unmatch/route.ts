import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { unmatchHandler, UNMATCH_RATE_LIMIT } from "@/server/mobile/matches";
import { mobileRoute } from "@/server/mobile/route";
import { unmatchStep } from "@/server/waves/service";

/** Ends an active match for good. No un-unmatch, matching the website's own confirm-step flow. */
export const POST = mobileRoute(
  "matches.unmatch",
  (context) =>
    unmatchHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, UNMATCH_RATE_LIMIT),
      unmatch: (person, matchId) => unmatchStep(prisma, person, matchId),
    }),
  { requireAccountSetup: true },
);
