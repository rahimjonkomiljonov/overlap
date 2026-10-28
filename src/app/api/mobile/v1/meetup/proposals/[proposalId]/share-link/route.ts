import { prisma } from "@/server/db";
import { createShareLinkStep } from "@/server/meetup/service";
import { SHARE_LINK_RATE_LIMIT, shareLinkHandler } from "@/server/mobile/meetup";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/** A text-only "share my plans" link for a trusted contact. Expires a few hours after the meetup ends. */
export const POST = mobileRoute(
  "meetup.shareLink",
  (context) =>
    shareLinkHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SHARE_LINK_RATE_LIMIT),
      create: (person, proposalId) => createShareLinkStep(prisma, person, proposalId),
    }),
  { requireAccountSetup: true, idempotent: true },
);
