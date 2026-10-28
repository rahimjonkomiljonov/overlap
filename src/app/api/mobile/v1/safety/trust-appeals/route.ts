import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { APPEAL_RATE_LIMIT, trustAppealHandler } from "@/server/mobile/safety";
import { submitTrustAppealStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Appeal a limit on how widely you are shown. One open appeal at a time. */
export const POST = mobileRoute(
  "safety.trustAppeal",
  (context) =>
    trustAppealHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, APPEAL_RATE_LIMIT),
      appeal: (person, note) => submitTrustAppealStep(prisma, person, note),
    }),
  { requireAccountSetup: true },
);
