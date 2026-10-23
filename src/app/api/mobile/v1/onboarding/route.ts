import { isCohortReleaseEnabled } from "@/server/cohorts/release";
import { onboardingInfo } from "@/server/mobile/onboarding";
import { mobileRoute } from "@/server/mobile/route";

/** What the app needs to draw the account-setup screens: is setup done, is an invite code needed, the minimum age. */
export const GET = mobileRoute("onboarding.info", (context) =>
  onboardingInfo(context, isCohortReleaseEnabled()),
);
