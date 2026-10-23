import { prisma } from "@/server/db";
import { profileBodies } from "@/server/mobile/profile";
import { profileStepRoute } from "@/server/mobile/profile-step";
import { saveValuesQuizStep } from "@/server/profile/service";

/** Saves this profile step (replaces the earlier answers). Same rules as the website's wizard. */
export const PUT = profileStepRoute("profile.values", profileBodies.values, (person, data) =>
  saveValuesQuizStep(prisma, person, data),
);
