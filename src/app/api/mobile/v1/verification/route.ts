import { mobileRoute } from "@/server/mobile/route";
import { verificationStatusHandler } from "@/server/mobile/uploads";
import { getMyVerificationStatus } from "@/server/verification/queries";

/** Where your own verification stands: unsubmitted, pending, rejected (with the reason) or verified. */
export const GET = mobileRoute(
  "verification.status",
  (context) => verificationStatusHandler(context, { status: getMyVerificationStatus }),
  { requireAccountSetup: true },
);
