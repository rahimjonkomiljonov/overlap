import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { PRIVACY_READ_RATE_LIMIT, privacyOverviewHandler } from "@/server/mobile/privacy";
import { mobileRoute } from "@/server/mobile/route";
import { getMyPrivacyOverview } from "@/server/privacy/queries";

/** Which consents are in force and which can be withdrawn, and the person's own request history. Open to a restricted account, and before account setup is finished. */
export const GET = mobileRoute(
  "privacy.overview",
  (context) =>
    privacyOverviewHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PRIVACY_READ_RATE_LIMIT),
      getOverview: (userId) => getMyPrivacyOverview(prisma, userId),
    }),
  { allowRestricted: true },
);
