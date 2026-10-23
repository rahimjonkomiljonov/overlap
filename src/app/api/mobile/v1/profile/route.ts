import { getDatingStatus } from "@/server/cohorts/release";
import { prisma } from "@/server/db";
import { profileView } from "@/server/mobile/profile-read";
import { mobileRoute } from "@/server/mobile/route";
import { getMissingRequiredSteps, getWizardState } from "@/server/profile/queries";

/** The person's own profile and where they are in the wizard: answers, photos, what is missing, whether Dating is open to them. */
export const GET = mobileRoute(
  "profile.get",
  (context) =>
    profileView(context, {
      getState: getWizardState,
      getMissing: getMissingRequiredSteps,
      getDatingStatus: (userId) => getDatingStatus(prisma, userId),
    }),
  { requireAccountSetup: true },
);
