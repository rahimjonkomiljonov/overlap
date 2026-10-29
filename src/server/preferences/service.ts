import type { PrismaClient } from "@/generated/prisma/client";

export type WeightSlidersDb = Pick<PrismaClient, "profile">;

export type SetWeightSlidersResult = { status: "saved" } | { status: "error"; code: "NO_PROFILE" };

/** B11: saves the person's own "what matters to me" sliders; they apply from the next daily batch. Shared by the website's `setWeightSliders` action and the mobile route. */
export async function setWeightSlidersStep(
  db: WeightSlidersDb,
  person: { userId: string },
  sliders: { classes: number; interests: number; freeTime: number },
): Promise<SetWeightSlidersResult> {
  const updated = await db.profile.updateMany({
    where: { userId: person.userId },
    data: { weightClasses: sliders.classes, weightInterests: sliders.interests, weightFreeTime: sliders.freeTime },
  });
  if (updated.count === 0) return { status: "error", code: "NO_PROFILE" };
  return { status: "saved" };
}
