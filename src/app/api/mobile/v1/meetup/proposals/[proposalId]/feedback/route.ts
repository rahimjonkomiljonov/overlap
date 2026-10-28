import { prisma } from "@/server/db";
import { submitMeetupFeedbackStep } from "@/server/meetup/service";
import { MEETUP_WRITE_RATE_LIMIT, feedbackHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** The private after-meetup check-in. Never files a report on its own, even for UNCOMFORTABLE. */
export const POST = mobileRoute(
  "meetup.feedback",
  (context) =>
    feedbackHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, MEETUP_WRITE_RATE_LIMIT),
      submit: (person, proposalId, response) => submitMeetupFeedbackStep(prisma, person, proposalId, response),
    }),
  { requireAccountSetup: true },
);
