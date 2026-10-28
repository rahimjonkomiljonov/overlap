"use server";

import { checkRateLimit } from "@/server/auth/rate-limit";
import { isRestricted } from "@/server/auth/authz";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { reviveConversationSchema, sendMessageSchema } from "./schema";
import { reviveConversationStep, sendMessageStep } from "./service";

export type SendMessageState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** S20 hardening: no cap exists on chat message volume otherwise — generous enough for real bursty conversation, tight enough to block scripted flooding. */
const SEND_MESSAGE_RATE_LIMIT = { max: 60, windowMs: 5 * 60 * 1000 };

export async function sendMessage(_prev: SendMessageState, formData: FormData): Promise<SendMessageState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };
  if (isRestricted(actor)) return { status: "error", code: "ACCOUNT_RESTRICTED" };

  const rate = await checkRateLimit(prisma, `send-message:${actor.userId}`, SEND_MESSAGE_RATE_LIMIT);
  if (!rate.allowed) {
    return { status: "error", code: "RATE_LIMITED" };
  }

  const parsed = sendMessageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    text: formData.get("text"),
  });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const result = await sendMessageStep(prisma, { userId: actor.userId }, parsed.data.conversationId, parsed.data.text);
  if (result.status === "error") {
    return { status: "error", code: result.code };
  }

  return { status: "success" };
}

export type ReviveConversationState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** D5's "one revive" — refuses if this conversation has already been revived once, or isn't actually expired, or the match has since been unmatched. */
export async function reviveConversation(_prev: ReviveConversationState, formData: FormData): Promise<ReviveConversationState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

  const parsed = reviveConversationSchema.safeParse({ conversationId: formData.get("conversationId") });
  if (!parsed.success) {
    return { status: "error", code: "INVALID_INPUT" };
  }

  const result = await reviveConversationStep(prisma, { userId: actor.userId }, parsed.data.conversationId);
  if (result.status === "error") {
    return { status: "error", code: result.code };
  }

  return { status: "success" };
}
