import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, unblockHandler } from "@/server/mobile/safety";
import { unblockUserStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Unblock a person. Unblocking someone who was never blocked is not an error. */
export const DELETE = mobileRoute(
  "blocks.remove",
  (context) =>
    unblockHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      unblock: (person, targetUserId) => unblockUserStep(prisma, person, targetUserId),
    }),
  { requireAccountSetup: true },
);
