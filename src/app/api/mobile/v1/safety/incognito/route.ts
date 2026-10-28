import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { SAFETY_WRITE_RATE_LIMIT, setIncognitoHandler } from "@/server/mobile/safety";
import { setIncognitoStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Incognito mode: browse and act as usual but never appear in anyone else's picks. */
export const PUT = mobileRoute(
  "safety.incognito",
  (context) =>
    setIncognitoHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SAFETY_WRITE_RATE_LIMIT),
      setIncognito: (person, incognito) => setIncognitoStep(prisma, person, incognito),
    }),
  { requireAccountSetup: true },
);
