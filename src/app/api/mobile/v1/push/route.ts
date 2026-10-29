import { prisma } from "@/server/db";
import { PUSH_READ_RATE_LIMIT, pushStatusHandler } from "@/server/mobile/push";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { deviceCountStep } from "@/server/push/service";

/** Whether push is switched on for this person's phones. */
export const GET = mobileRoute(
  "push.status",
  (context) =>
    pushStatusHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PUSH_READ_RATE_LIMIT),
      countDevices: (person) => deviceCountStep(prisma, person),
    }),
  { requireAccountSetup: true },
);
