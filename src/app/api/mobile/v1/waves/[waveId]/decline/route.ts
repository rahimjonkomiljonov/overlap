import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { WAVE_DECLINE_RATE_LIMIT, declineWaveHandler } from "@/server/mobile/waves";
import { declineWaveStep } from "@/server/waves/service";

/** Dismisses an incoming wave from the inbox without waving back. No cost against either side's cap. */
export const POST = mobileRoute(
  "waves.decline",
  (context) =>
    declineWaveHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, WAVE_DECLINE_RATE_LIMIT),
      decline: (person, waveId) => declineWaveStep(prisma, person, waveId),
    }),
  { requireAccountSetup: true },
);
