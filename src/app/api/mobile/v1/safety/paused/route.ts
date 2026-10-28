import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, setPausedHandler } from "@/server/mobile/safety";
import { setPausedStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Pause or unpause the profile. Open to a paused account so it can come back; a suspended or banned one is refused. */
export const PUT = mobileRoute(
  "safety.paused",
  (context) =>
    setPausedHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      setPaused: (person, paused) => setPausedStep(prisma, person, paused),
    }),
  { requireAccountSetup: true, allowRestricted: true },
);
