import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, hideCourseHandler } from "@/server/mobile/safety";
import { hideByCourseStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Hide everyone currently in one of your courses (one rule per person). */
export const POST = mobileRoute(
  "hides.course",
  (context) =>
    hideCourseHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      hide: (person, courseId) => hideByCourseStep(prisma, person, courseId),
    }),
  { requireAccountSetup: true },
);
