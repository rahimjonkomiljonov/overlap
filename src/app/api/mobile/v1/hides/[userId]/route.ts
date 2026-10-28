import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, unhideHandler } from "@/server/mobile/safety";
import { unhideStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Unhide a person. */
export const DELETE = mobileRoute(
  "hides.remove",
  (context) =>
    unhideHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      unhide: (person, hiddenUserId) => unhideStep(prisma, person, hiddenUserId),
    }),
  { requireAccountSetup: true },
);
