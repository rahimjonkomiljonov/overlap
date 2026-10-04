"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { setWeightSlidersSchema } from "./schema";

export type PreferencesState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** B11: saves the viewer's own "what matters to me" sliders. They apply from the next daily batch. */
export async function setWeightSliders(_prev: PreferencesState, formData: FormData): Promise<PreferencesState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = setWeightSlidersSchema.safeParse({
    classes: formData.get("classes"),
    interests: formData.get("interests"),
    freeTime: formData.get("freeTime"),
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const updated = await prisma.profile.updateMany({
    where: { userId: actor.userId },
    data: {
      weightClasses: parsed.data.classes,
      weightInterests: parsed.data.interests,
      weightFreeTime: parsed.data.freeTime,
    },
  });
  if (updated.count === 0) return { status: "error", code: "NO_PROFILE" };
  return { status: "success" };
}
