import { prisma } from "@/server/db";
import { profileBodies } from "@/server/mobile/profile";
import { profileStepRoute } from "@/server/mobile/profile-step";
import { saveInterestsStep } from "@/server/profile/service";

/** Saves this profile step (replaces the earlier answers). Same rules as the website's wizard. */
export const PUT = profileStepRoute("profile.interests", profileBodies.interests, (person, data) =>
  saveInterestsStep(prisma, person, data),
);
