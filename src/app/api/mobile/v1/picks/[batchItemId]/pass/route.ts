import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { PICK_PASS_RATE_LIMIT, pickPassHandler } from "@/server/mobile/picks";
import { passPickStep } from "@/server/picks/service";

/** Passes on one of your own picks. It is not listed again, and someone else's pick looks exactly like one that does not exist. */
export const POST = mobileRoute(
  "picks.pass",
  (context) =>
    pickPassHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PICK_PASS_RATE_LIMIT),
      pass: (person, batchItemId) => passPickStep(prisma, person, batchItemId),
    }),
  { requireAccountSetup: true, idempotent: true },
);
