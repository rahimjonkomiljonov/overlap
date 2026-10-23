import { prisma } from "@/server/db";
import { finishHandler } from "@/server/mobile/profile-read";
import { mobileRoute } from "@/server/mobile/route";
import { getMissingRequiredSteps } from "@/server/profile/queries";
import { finishProfileStep } from "@/server/profile/service";

/** Marks the profile finished when every required piece is there; otherwise says what is missing. */
export const POST = mobileRoute(
  "profile.finish",
  (context) =>
    finishHandler(context, {
      finish: (person) => finishProfileStep(prisma, person, getMissingRequiredSteps),
    }),
  { requireAccountSetup: true },
);
