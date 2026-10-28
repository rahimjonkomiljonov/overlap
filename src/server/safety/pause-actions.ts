"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { setIncognitoSchema, setPausedSchema } from "./schema";
import { setIncognitoStep, setPausedStep } from "./service";

export type SafetyToggleState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** G3 "pause profile". Rules in `setPausedStep`, shared with the mobile route. */
export async function setPaused(_prev: SafetyToggleState, formData: FormData): Promise<SafetyToggleState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = setPausedSchema.safeParse({ paused: formData.get("paused") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await setPausedStep(prisma, { userId: actor.userId, status: actor.status }, parsed.data.paused === "true");
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

/** G3 "incognito mode": browse and act normally, but never appear as a candidate to anyone else. */
export async function setIncognito(_prev: SafetyToggleState, formData: FormData): Promise<SafetyToggleState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = setIncognitoSchema.safeParse({ incognito: formData.get("incognito") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await setIncognitoStep(prisma, { userId: actor.userId }, parsed.data.incognito === "true");
  return { status: "success" };
}
