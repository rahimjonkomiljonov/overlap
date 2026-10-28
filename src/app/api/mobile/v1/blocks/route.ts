import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, blockHandler } from "@/server/mobile/safety";
import { blockUserStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Block a person: mutual invisibility, permanent unless undone. */
export const POST = mobileRoute(
  "blocks.create",
  (context) =>
    blockHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      block: (person, input) => blockUserStep(prisma, person, input),
    }),
  { requireAccountSetup: true },
);
