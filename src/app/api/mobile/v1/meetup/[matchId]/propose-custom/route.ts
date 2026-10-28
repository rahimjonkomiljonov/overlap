import { prisma } from "@/server/db";
import { proposeCustomMeetupStep } from "@/server/meetup/service";
import { MEETUP_WRITE_RATE_LIMIT, proposeCustomHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** "Suggest your own time": a day, a daytime block and a Safe Spot, for two people with no shared free time. */
export const POST = mobileRoute(
  "meetup.proposeCustom",
  (context) =>
    proposeCustomHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MEETUP_WRITE_RATE_LIMIT),
      propose: (person, matchId, input) => proposeCustomMeetupStep(prisma, person, { matchId, ...input }),
    }),
  { requireAccountSetup: true, idempotent: true },
);
