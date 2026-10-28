import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { APPEAL_RATE_LIMIT, appealHandler } from "@/server/mobile/safety";
import { submitAppealStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** The one-time appeal on a moderation action taken against you. Open to a suspended or banned account. */
export const POST = mobileRoute(
  "safety.appeal",
  (context) =>
    appealHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, APPEAL_RATE_LIMIT),
      appeal: (person, input) => submitAppealStep(prisma, person, input),
    }),
  { requireAccountSetup: true, allowRestricted: true },
);
