"use server";

import { UserStatus } from "@/generated/prisma/enums";
import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { WAVE_ATTEMPT_RATE_LIMIT } from "@/server/waves/cap";
import { pocketWaveSchema, setPocketsVisibleSchema } from "./schema";
import { waveFromPocketStep } from "./service";

export type PocketActionState =
  | { status: "idle" }
  | { status: "success"; matched?: boolean }
  | { status: "error"; code: string };

/** C7's visibility switch: off by default, and only visible people can browse pockets. */
export async function setPocketsVisible(
  _prev: PocketActionState,
  formData: FormData,
): Promise<PocketActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = setPocketsVisibleSchema.safeParse({ visible: formData.get("visible") });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };

  await prisma.profile.update({
    where: { userId: actor.userId },
    data: { pocketsVisible: parsed.data.visible === "true" },
  });
  return { status: "success" };
}

/**
 * A wave sent from a pocket: same 8/day cap, rate limit, block check and mutual-match
 * rule as a wave from Daily Picks (src/server/picks/actions.ts's `sendWave`), with no
 * BatchItem behind it. The target must be someone the actor can see in that pocket
 * right now, re-checked here rather than trusting the page.
 */
export async function waveFromPocket(
  _prev: PocketActionState,
  formData: FormData,
): Promise<PocketActionState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (actor.status !== UserStatus.ACTIVE) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const rate = await checkRateLimit(prisma, `wave-attempt:${actor.userId}`, WAVE_ATTEMPT_RATE_LIMIT);
  if (!rate.allowed) return { status: "error", code: "RATE_LIMITED" };

  const parsed = pocketWaveSchema.safeParse({
    kind: formData.get("kind"),
    pocketId: formData.get("pocketId"),
    toUserId: formData.get("toUserId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { status: "error", code: "INVALID_INPUT" };
  const { kind, pocketId, toUserId, note } = parsed.data;
  const viewer = { userId: actor.userId, campusId: actor.campusId };

  const result = await waveFromPocketStep(prisma, viewer, kind, pocketId, toUserId, note);
  if (result.status === "error") return { status: "error", code: result.code };
  return { status: "success", matched: result.matched };
}
