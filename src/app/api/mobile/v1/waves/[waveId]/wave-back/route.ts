import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { WAVE_BACK_RATE_LIMIT, waveBackHandler } from "@/server/mobile/waves";
import { waveBackStep } from "@/server/waves/service";

/** Waves back at whoever sent this wave. Completes the pair into a match right away, since the incoming wave is already PENDING. */
export const POST = mobileRoute(
  "waves.waveBack",
  (context) =>
    waveBackHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, WAVE_BACK_RATE_LIMIT),
      waveBack: (person, waveId, note) => waveBackStep(prisma, person, waveId, note),
    }),
  { requireAccountSetup: true, idempotent: true },
);
