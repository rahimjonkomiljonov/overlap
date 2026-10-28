import { prisma } from "@/server/db";
import { getEventDetail } from "@/server/events/queries";
import { EVENTS_RATE_LIMIT, eventDetailHandler } from "@/server/mobile/events";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** One event: its details, the caller's RSVP, and the guest list (opted-in guests only, verified viewers only). */
export const GET = mobileRoute(
  "events.detail",
  (context) =>
    eventDetailHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, EVENTS_RATE_LIMIT),
      getEvent: (person, eventId) => getEventDetail(prisma, eventId, person),
    }),
  { requireAccountSetup: true },
);
