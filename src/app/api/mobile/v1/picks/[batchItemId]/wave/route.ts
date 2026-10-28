import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { PICK_WAVE_RATE_LIMIT, pickWaveHandler } from "@/server/mobile/waves";
import { sendWaveStep } from "@/server/picks/service";

/** Waves at one of your own undecided picks. Same 8/day cap, block check and mutual-match rule as the website's wave composer. */
export const POST = mobileRoute(
  "picks.wave",
  (context) =>
    pickWaveHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PICK_WAVE_RATE_LIMIT),
      wave: (person, batchItemId, note) =>
        sendWaveStep(prisma, person, batchItemId, { type: "profile" }, note),
    }),
  { requireAccountSetup: true, idempotent: true },
);
