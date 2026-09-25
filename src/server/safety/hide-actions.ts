"use server";

import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { hideByClubSchema, hideByCourseSchema, hideByEmailSchema, unhideSchema } from "./schema";

export type HideActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: string };

/**
 * G3 hide-from controls. "Hide by course/club" is read, per HideRule's own model doc, as
 * a way to *find* who to hide, not a stored filter shape — this resolves the course/club
 * to every other user currently enrolled in it and persists one `HideRule` row per
 * resulting user, exactly like hiding someone individually would.
 */
export async function hideByCourse(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = hideByCourseSchema.safeParse({ courseId: formData.get("courseId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const others = await prisma.profileCourse.findMany({
    where: { courseId: parsed.data.courseId, profile: { userId: { not: actor.userId } } },
    select: { profile: { select: { userId: true } } },
  });
  await hideAll(actor.userId, others.map((o) => o.profile.userId));

  return { status: "success" };
}

export async function hideByClub(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = hideByClubSchema.safeParse({ clubId: formData.get("clubId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const others = await prisma.profileClub.findMany({
    where: { clubId: parsed.data.clubId, profile: { userId: { not: actor.userId } } },
    select: { profile: { select: { userId: true } } },
  });
  await hideAll(actor.userId, others.map((o) => o.profile.userId));

  return { status: "success" };
}

export async function hideByEmail(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = hideByEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const target = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (!target) return { status: "error", code: "NOT_FOUND" };
  if (target.id === actor.userId) return { status: "error", code: "CANNOT_HIDE_SELF" };

  await hideAll(actor.userId, [target.id]);
  return { status: "success" };
}

export async function unhide(_prev: HideActionState, formData: FormData): Promise<HideActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = unhideSchema.safeParse({ hiddenUserId: formData.get("hiddenUserId") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await prisma.hideRule.deleteMany({ where: { userId: actor.userId, hiddenUserId: parsed.data.hiddenUserId } });
  return { status: "success" };
}

async function hideAll(userId: string, hiddenUserIds: string[]): Promise<void> {
  if (hiddenUserIds.length === 0) return;
  await prisma.hideRule.createMany({
    data: hiddenUserIds.map((hiddenUserId) => ({ userId, hiddenUserId })),
    skipDuplicates: true,
  });
}
