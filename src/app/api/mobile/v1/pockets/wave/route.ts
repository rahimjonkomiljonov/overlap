import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { POCKET_WAVE_RATE_LIMIT, pocketWaveHandler } from "@/server/mobile/pockets";
import { waveFromPocketStep } from "@/server/pockets/service";

/**
 * POST /pockets/wave (idempotent). Same rules as the website's `waveFromPocket` action, via the
 * shared `waveFromPocketStep`: 8/day cap, block check, mutual match, and the target re-checked as
 * a current pocket member rather than trusted from the app.
 */
export const POST = mobileRoute(
  "pockets.wave",
  (context) =>
    pocketWaveHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, POCKET_WAVE_RATE_LIMIT),
      wave: (person, kind, pocketId, toUserId, note) =>
        waveFromPocketStep(
          prisma,
          { userId: person.userId, campusId: person.campusId },
          kind,
          pocketId,
          toUserId,
          note,
        ),
    }),
  { requireAccountSetup: true, idempotent: true },
);
