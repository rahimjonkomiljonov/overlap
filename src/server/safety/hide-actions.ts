"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hideByClubSchema, hideByCourseSchema, hideByEmailSchema, unhideSchema } from "./schema";
import { hideByClubStep, hideByCourseStep, hideByEmailStep, unhideStep } from "./service";

export type HideActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/** G3 hide-from controls. Rules in the `hideBy…Step` functions of service.ts, shared with the mobile routes. */
export async function hideByCourse(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = hideByCourseSchema.safeParse({ courseId: formData.get("courseId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await hideByCourseStep(prisma, { userId: actor.userId }, parsed.data.courseId);
  return { status: "success" };
}

export async function hideByClub(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = hideByClubSchema.safeParse({ clubId: formData.get("clubId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await hideByClubStep(prisma, { userId: actor.userId }, parsed.data.clubId);
  return { status: "success" };
}

export async function hideByEmail(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = hideByEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const result = await hideByEmailStep(prisma, { userId: actor.userId }, parsed.data.email);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success" };
}

export async function unhide(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = unhideSchema.safeParse({ hiddenUserId: formData.get("hiddenUserId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await unhideStep(prisma, { userId: actor.userId }, parsed.data.hiddenUserId);
  return { status: "success" };
}
