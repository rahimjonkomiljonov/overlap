import { prisma } from "@/server/db";
import { connectAtEventStep } from "@/server/events/service";
import { EVENT_ACTION_RATE_LIMIT, connectHandler } from "@/server/mobile/events";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** "We met": pick someone from the guest list in the 48 hours after the event. A mutual pick makes a match. */
export const POST = mobileRoute(
  "events.connect",
  (context) =>
    connectHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, EVENT_ACTION_RATE_LIMIT),
      connect: (person, input) => connectAtEventStep(prisma, person, input),
    }),
  { requireAccountSetup: true, idempotent: true },
);
