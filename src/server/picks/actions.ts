"use server";

import { checkRateLimit } from "@/server/auth/rate-limit";
import { isRestricted } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { WAVE_ATTEMPT_RATE_LIMIT } from "@/server/waves/cap";
import { passPickSchema, sendWaveSchema } from "./schema";
import { passPickStep, sendWaveStep } from "./service";

export type SendWaveState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/**
 * Sends a wave from one still-actionable pick (S12's "wave composer"). Checks the 8/day
 * cap and blocks (S14), and completes a match immediately if the target already waved at
 * the actor first (`src/server/waves/match.ts`'s `formMatch`) — the inbox's `waveBack`
 * (`src/server/waves/actions.ts`) is the mirror image of this for the other direction.
 */
export async function sendWave(_prev: SendWaveState, formData: FormData): Promise<SendWaveState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (isRestricted(actor)) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const rate = await checkRateLimit(prisma, `wave-attempt:${actor.userId}`, WAVE_ATTEMPT_RATE_LIMIT);
  if (!rate.allowed) {
    return { status: "error", code: "RATE_LIMITED" };
  }

  const targetType = formData.get("targetType");
  const targetElement =
    targetType === "photo"
      ? { type: "photo" as const, photoId: formData.get("photoId") }
      : targetType === "promptAnswer"
        ? { type: "promptAnswer" as const, promptAnswerId: formData.get("promptAnswerId") }
        : { type: "profile" as const };

  const parsed = sendWaveSchema.safeParse({
    batchItemId: formData.get("batchItemId"),
    targetElement,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const result = await sendWaveStep(
    prisma,
    actor,
    parsed.data.batchItemId,
    parsed.data.targetElement,
    parsed.data.note,
  );
  if (result.status === "error") return { status: "error", code: result.code };

  return { status: "success" };
}

export type PassPickState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

export async function passPick(_prev: PassPickState, formData: FormData): Promise<PassPickState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = passPickSchema.safeParse({ batchItemId: formData.get("batchItemId") });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const result = await passPickStep(prisma, actor, parsed.data.batchItemId);
  if (result.status === "error") return { status: "error", code: result.code };

  return { status: "success" };
}
