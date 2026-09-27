"use server";

import { checkRateLimit } from "@/server/auth/rate-limit";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getConversationForActor } from "./queries";
import { reviveConversationSchema, sendMessageSchema } from "./schema";

export type SendMessageState = { status: "idle" } | { status: "success" } | { status: "error"; code: string };

/** S20 hardening: no cap exists on chat message volume otherwise — generous enough for real bursty conversation, tight enough to block scripted flooding. */
const SEND_MESSAGE_RATE_LIMIT = { max: 60, windowMs: 5 * 60 * 1000 };

export async function sendMessage(_prev: SendMessageState, formData: FormData): Promise<SendMessageState> {
  const actor = await getActor();
  if (!actor) return { status: "error", code: "UNAUTHENTICATED" };

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

  const conversation = await getConversationForActor(prisma, parsed.data.conversationId, actor.userId);
  if (!conversation) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (conversation.matchStatus !== "ACTIVE") {
    return { status: "error", code: "UNMATCHED" };
  }
  if (conversation.status !== "ACTIVE") {
    return { status: "error", code: "EXPIRED" };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: conversation.conversationId, senderId: actor.userId, text: parsed.data.text },
    }),
    prisma.conversation.update({
      where: { id: conversation.conversationId },
      data: { lastMessageAt: now, nudgedAt: null },
    }),
  ]);

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

  const conversation = await getConversationForActor(prisma, parsed.data.conversationId, actor.userId);
  if (!conversation) {
    return { status: "error", code: "NOT_FOUND" };
  }
  if (conversation.matchStatus !== "ACTIVE") {
    return { status: "error", code: "UNMATCHED" };
  }
  if (conversation.status !== "EXPIRED") {
    return { status: "error", code: "NOT_EXPIRED" };
  }
  if (conversation.revivedAt !== null) {
    return { status: "error", code: "ALREADY_REVIVED" };
  }

  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversation.conversationId },
    data: { status: "ACTIVE", revivedAt: now, lastMessageAt: now },
  });

  return { status: "success" };
}
