import { prisma } from "@/server/db";
import { respondToMeetupStep } from "@/server/meetup/service";
import { MEETUP_WRITE_RATE_LIMIT, respondHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** The other person accepts or declines a proposed meetup. */
export const POST = mobileRoute(
  "meetup.respond",
  (context) =>
    respondHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MEETUP_WRITE_RATE_LIMIT),
      respond: (person, proposalId, decision) => respondToMeetupStep(prisma, person, proposalId, decision),
    }),
  { requireAccountSetup: true },
);
