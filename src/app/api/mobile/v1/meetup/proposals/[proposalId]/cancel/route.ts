import { prisma } from "@/server/db";
import { cancelMeetupStep } from "@/server/meetup/service";
import { MEETUP_WRITE_RATE_LIMIT, cancelHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** Either person calls off a confirmed meetup. */
export const POST = mobileRoute(
  "meetup.cancel",
  (context) =>
    cancelHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MEETUP_WRITE_RATE_LIMIT),
      cancel: (person, proposalId) => cancelMeetupStep(prisma, person, proposalId),
    }),
  { requireAccountSetup: true },
);
