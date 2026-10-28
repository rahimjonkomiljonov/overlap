import { prisma } from "@/server/db";
import { listEvents } from "@/server/events/queries";
import { EVENTS_RATE_LIMIT, eventsListHandler } from "@/server/mobile/events";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** Upcoming and ongoing events on the caller's campus, plus ones still in their 48-hour connect window. Creating events stays on the web. */
export const GET = mobileRoute(
  "events.list",
  (context) =>
    eventsListHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, EVENTS_RATE_LIMIT),
      listEvents: (person) => listEvents(prisma, person),
    }),
  { requireAccountSetup: true },
);
