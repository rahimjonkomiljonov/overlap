import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { SELFIE_RATE_LIMIT, selfieUploadHandler } from "@/server/mobile/uploads";
import { submitSelfieStep } from "@/server/verification/selfie-service";

/** Submits a verification selfie (multipart field "selfie"). Private: only you and the reviewing moderator can ever see it. */
export const POST = mobileRoute(
  "verification.selfie",
  (context) =>
    selfieUploadHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SELFIE_RATE_LIMIT),
      submit: (person, file, maxBytes) => submitSelfieStep(prisma, person, file, maxBytes),
    }),
  { requireAccountSetup: true },
);
