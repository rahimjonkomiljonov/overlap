import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { EXPORT_RATE_LIMIT, exportHandler } from "@/server/mobile/privacy";
import { mobileRoute } from "@/server/mobile/route";
import { exportMyDataStep } from "@/server/privacy/service";

/** "Download my data": only the person's own data, and a completed ACCESS request on record. Open to a restricted account. */
export const GET = mobileRoute(
  "privacy.export",
  (context) =>
    exportHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, EXPORT_RATE_LIMIT),
      exportData: (person) => exportMyDataStep(prisma, person),
    }),
  { allowRestricted: true },
);
