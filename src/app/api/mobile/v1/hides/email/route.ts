import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { HIDE_BY_EMAIL_RATE_LIMIT, hideEmailHandler } from "@/server/mobile/safety";
import { hideByEmailStep } from "@/server/safety/service";
import { mobileRoute } from "@/server/mobile/route";

/** Hide one person by school email. An address with no account is 404. */
export const POST = mobileRoute(
  "hides.email",
  (context) =>
    hideEmailHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, HIDE_BY_EMAIL_RATE_LIMIT),
      hide: (person, email) => hideByEmailStep(prisma, person, email),
    }),
  { requireAccountSetup: true },
);
