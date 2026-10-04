import type { PrismaClient } from "@/generated/prisma/client";
import { NEUTRAL_SLIDERS, type WeightSliders } from "@/server/matching/personalize";

/** The viewer's own B11 sliders; neutral if the profile doesn't exist yet. */
export async function getMyWeightSliders(
  db: Pick<PrismaClient, "profile">,
  userId: string,
): Promise<WeightSliders> {
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { weightClasses: true, weightInterests: true, weightFreeTime: true },
  });
  if (!profile) return NEUTRAL_SLIDERS;
  return {
    classes: profile.weightClasses,
    interests: profile.weightInterests,
    freeTime: profile.weightFreeTime,
  };
}
