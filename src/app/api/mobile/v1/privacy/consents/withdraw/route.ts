import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { PRIVACY_WRITE_RATE_LIMIT, withdrawConsentHandler } from "@/server/mobile/privacy";
import { mobileRoute } from "@/server/mobile/route";
import { withdrawConsentStep } from "@/server/privacy/service";

/** Withdraw an optional consent at any time. The sensitive "who I'd like to meet" consent also deletes that stored field at once. Open to a restricted account. */
export const POST = mobileRoute(
  "privacy.withdraw",
  (context) =>
    withdrawConsentHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PRIVACY_WRITE_RATE_LIMIT),
      withdraw: (person, type) => withdrawConsentStep(prisma, person, type),
    }),
  { allowRestricted: true },
);
