import { prisma } from "@/server/db";
import { proposeMeetupStep } from "@/server/meetup/service";
import { MEETUP_WRITE_RATE_LIMIT, proposeHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** Proposes one of the suggested times at a Safe Spot. The other person then accepts or declines. */
export const POST = mobileRoute(
  "meetup.propose",
  (context) =>
    proposeHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MEETUP_WRITE_RATE_LIMIT),
      propose: (person, matchId, input) => proposeMeetupStep(prisma, person, { matchId, ...input }),
    }),
  { requireAccountSetup: true, idempotent: true },
);
