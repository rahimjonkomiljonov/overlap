import { prisma } from "@/server/db";
import { profileBodies } from "@/server/mobile/profile";
import { profileStepRoute } from "@/server/mobile/profile-step";
import { saveClubsStep } from "@/server/profile/service";

/** Saves this profile step (replaces the earlier answers). Same rules as the website's wizard. */
export const PUT = profileStepRoute("profile.clubs", profileBodies.clubs, (person, data) =>
  saveClubsStep(prisma, person, data),
);
