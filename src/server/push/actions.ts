"use server";

import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { removePushSubscriptionSchema, savePushSubscriptionSchema } from "./schema";

export type PushActionResult = { status: "success" } | { status: "error"; code: string };

/** Saves this browser's push subscription for the signed-in user (the opt-in itself). */
export async function savePushSubscription(input: unknown): Promise<PushActionResult> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const limit = await checkRateLimit(prisma, `push-subscribe:${actor.userId}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return { status: "error", code: "RATE_LIMITED" };

  const parsed = savePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  const { endpoint, keys } = parsed.data;
  // One endpoint belongs to one browser profile; if someone else signed in there before,
  // it moves to whoever is signed in now.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: actor.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: actor.userId, p256dh: keys.p256dh, auth: keys.auth },
  });
  return { status: "success" };
}

/** Removes this browser's subscription, only if it belongs to the signed-in user. */
export async function removePushSubscription(input: unknown): Promise<PushActionResult> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = removePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: actor.userId },
  });
  return { status: "success" };
}
