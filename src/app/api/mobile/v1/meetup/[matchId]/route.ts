import { prisma } from "@/server/db";
import { getMeetupScreen } from "@/server/meetup/screen";
import { MEETUP_READ_RATE_LIMIT, meetupScreenHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** The meetup planner for one match: the live proposal or the options to make one, plus the emergency numbers. */
export const GET = mobileRoute(
  "meetup.screen",
  (context) =>
    meetupScreenHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MEETUP_READ_RATE_LIMIT),
      getScreen: (person, matchId) => getMeetupScreen(prisma, person, matchId),
    }),
  { requireAccountSetup: true },
);
