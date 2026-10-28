import { prisma } from "@/server/db";
import { setRsvpStep } from "@/server/events/service";
import { EVENT_ACTION_RATE_LIMIT, rsvpHandler } from "@/server/mobile/events";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** Going or not, and whether to show up in the guest list. Setting the same answer again is harmless. */
export const PUT = mobileRoute(
  "events.rsvp",
  (context) =>
    rsvpHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, EVENT_ACTION_RATE_LIMIT),
      setRsvp: (person, input) => setRsvpStep(prisma, person, input),
    }),
  { requireAccountSetup: true },
);
