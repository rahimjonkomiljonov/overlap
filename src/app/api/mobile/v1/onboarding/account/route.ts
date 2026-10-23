import { completeAccountSetup } from "@/server/auth/account-setup";
import { getActiveAgeVerifier } from "@/server/auth/age-verifier";
import { isCohortReleaseEnabled } from "@/server/cohorts/release";
import { prisma } from "@/server/db";
import { accountSetupHandler, ONBOARDING_RATE_LIMIT } from "@/server/mobile/onboarding";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";

/**
 * Finishes account setup: age check, Terms and Privacy consent, the optional sensitive consent
 * and the invite code when cohort release is on. The same shared function as the website's
 * onboarding, so the rules cannot differ.
 */
export const POST = mobileRoute("onboarding.account", (context) =>
  accountSetupHandler(context, {
    complete: (input) =>
      completeAccountSetup(
        { db: prisma, verifier: getActiveAgeVerifier(), cohortRelease: isCohortReleaseEnabled() },
        input,
      ),
    limit: (key) => enforceRateLimit(prisma, key, ONBOARDING_RATE_LIMIT),
  }),
);
