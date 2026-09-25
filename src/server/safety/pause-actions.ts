"use server";

import { UserStatus } from "@/generated/prisma/enums";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { setIncognitoSchema, setPausedSchema } from "./schema";

export type SafetyToggleState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * G3 "pause profile": flips between ACTIVE and PAUSED only — never touches a SUSPENDED
 * or BANNED status, so a restricted user can't self-service their way back to visibility.
 */
export async function setPaused(_prev: SafetyToggleState, formData: FormData): Promise<SafetyToggleState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = setPausedSchema.safeParse({ paused: formData.get("paused") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  if (actor.status !== UserStatus.ACTIVE && actor.status !== UserStatus.PAUSED) {
    return { status: "error", code: "ACCOUNT_RESTRICTED" };
  }

  await prisma.user.update({
    where: { id: actor.userId },
    data: { status: parsed.data.paused === "true" ? UserStatus.PAUSED : UserStatus.ACTIVE },
  });
  return { status: "success" };
}

/** G3 "incognito mode": browse and act normally, but never appear as a candidate to anyone else. */
export async function setIncognito(_prev: SafetyToggleState, formData: FormData): Promise<SafetyToggleState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = setIncognitoSchema.safeParse({ incognito: formData.get("incognito") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await prisma.profile.update({
    where: { userId: actor.userId },
    data: { incognito: parsed.data.incognito === "true" },
  });
  return { status: "success" };
}
