import type { PrismaClient } from "@/generated/prisma/client";
import { encryptField } from "@/server/privacy/encryption";
import type { SyntheticCampusPlan } from "./plan";

export type SyntheticPersistDb = Pick<PrismaClient, "user">;

/** Final onboarding step index (S07's 11-step wizard, 0-indexed) — marks the profile as fully walked, not just complete. */
const FINAL_ONBOARDING_STEP = 10;
/** Dummy dimensions for the placeholder photo rows — nothing ever resolves these to a real image. */
const PLACEHOLDER_PHOTO_DIMENSIONS = { width: 1200, height: 1600 };
const PHOTOS_PER_USER = 3;

/**
 * Writes a plan (plan.ts) to the database. Thin on purpose: every decision about *what*
 * to create already happened in the pure, tested planning step — this just turns each
 * `SyntheticUserPlan` into one nested `user.create` (account + profile + its relations
 * in a single write). Sequential rather than `Promise.all`, deliberately: this can run
 * against the pooled app connection (src/server/db.ts caps it at 1) as well as a
 * script's own client, and 500-1,000 concurrent nested creates would exhaust either.
 */
export async function persistSyntheticCampus(
  db: SyntheticPersistDb,
  plan: SyntheticCampusPlan,
): Promise<{ createdUsers: number }> {
  const now = new Date();

  for (const user of plan.users) {
    await db.user.create({
      data: {
        name: user.firstName,
        email: user.email,
        emailVerified: true,
        campusId: plan.campusId,
        birthYear: user.birthYear,
        ageVerifiedAt: now,
        verifiedAt: now,
        isSynthetic: true,
        syntheticCommunity: user.communityIndex,
        profile: {
          create: {
            firstName: user.firstName,
            gender: user.gender,
            year: user.year,
            major: user.major,
            intents: user.intents,
            interestedIn: user.interestedIn ? encryptField(JSON.stringify(user.interestedIn)) : null,
            freeTimeSlots: user.freeTimeSlots,
            valuesAnswers: user.valuesAnswers,
            onboardingStep: FINAL_ONBOARDING_STEP,
            completedAt: now,
            courses: { create: user.courseIds.map((courseId) => ({ courseId })) },
            clubs: { create: user.clubIds.map((clubId) => ({ clubId })) },
            interests: { create: user.interestTagIds.map((interestTagId) => ({ interestTagId })) },
            promptAnswers: { create: user.promptAnswers },
            photos: {
              create: Array.from({ length: PHOTOS_PER_USER }, (_, i) => ({
                storageKey: `synthetic/${user.communityIndex}-${user.index}/${i}.jpg`,
                sortOrder: i,
                ...PLACEHOLDER_PHOTO_DIMENSIONS,
              })),
            },
          },
        },
      },
    });
  }

  return { createdUsers: plan.users.length };
}
