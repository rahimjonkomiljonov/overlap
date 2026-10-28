import type { NextResponse } from "next/server";
import * as z from "zod";
import { MAX_MESSAGE_LENGTH } from "@/server/chat/schema";
import type { ChatDetail } from "@/server/chat/queries";
import type { ReviveConversationResult, SendMessageResult } from "@/server/chat/service";
import { mobileError, type MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { absoluteUrl } from "./urls";
import { readJson, readQuery } from "./validate";

export const CHAT_DETAIL_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const SEND_MESSAGE_RATE_LIMIT = { max: 60, windowMs: 5 * 60 * 1000 };
export const REVIVE_CONVERSATION_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 };

type Person = { userId: string; campusId: string };
const personOf = (context: MobileContext): Person => ({
  userId: context.actor.userId,
  campusId: context.actor.campusId,
});

const localeQuery = z.strictObject({ locale: z.enum(["en", "ko"]).default("en") });

/** GET /chat/{conversationId}. The id is the last part of the path. */
const conversationIdSchema = z.string().min(1).max(64);
function conversationIdFromPath(url: string): { ok: true; id: string } | { ok: false } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = conversationIdSchema.safeParse(parts[parts.length - 1] ?? "");
  return id.success ? { ok: true, id: id.data } : { ok: false };
}

export type ChatDetailDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  getChatDetail: (person: Person, conversationId: string, locale: "en" | "ko") => Promise<ChatDetail | null>;
};

/** GET /chat/{conversationId}: the thread itself, its messages oldest first, and icebreakers while it is still empty. Polled every few seconds while the thread is open. */
export async function chatDetailHandler(context: MobileContext, deps: ChatDetailDeps): Promise<NextResponse> {
  const id = conversationIdFromPath(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");

  const query = readQuery(context.request, localeQuery);
  if (!query.ok) return query.response;

  const limited = await deps.limit(`chat-detail:${context.actor.userId}`);
  if (limited) return limited;

  const detail = await deps.getChatDetail(personOf(context), id.id, query.data.locale);
  if (!detail) return mobileError("NOT_FOUND");

  return mobileJson({
    conversationId: detail.conversationId,
    matchId: detail.matchId,
    status: detail.status,
    revivedAt: detail.revivedAt?.toISOString() ?? null,
    matchStatus: detail.matchStatus,
    otherUserId: detail.otherUserId,
    otherFirstName: detail.otherFirstName,
    otherPhotoUrl: detail.otherPhotoUrl ? absoluteUrl(context.request, detail.otherPhotoUrl) : null,
    canInteract: detail.canInteract,
    messages: detail.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    })),
    icebreakers: detail.icebreakers,
  });
}

/** Both /chat/{id}/messages and /chat/{id}/revive take the id as the second to last path part. */
function conversationIdFromActionPath(url: string): { ok: true; id: string } | { ok: false } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const id = conversationIdSchema.safeParse(parts[parts.length - 2] ?? "");
  return id.success ? { ok: true, id: id.data } : { ok: false };
}

const sendMessageBody = z.strictObject({ text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) });

export type SendMessageDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  send: (person: Person, conversationId: string, text: string) => Promise<SendMessageResult>;
};

/** POST /chat/{id}/messages (idempotent). */
export async function sendMessageHandler(context: MobileContext, deps: SendMessageDeps): Promise<NextResponse> {
  const id = conversationIdFromActionPath(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");

  const body = await readJson(context.request, sendMessageBody);
  if (!body.ok) return body.response;

  const limited = await deps.limit(`send-message:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.send(personOf(context), id.id, body.data.text);
  if (result.status === "error") {
    return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({
    status: "sent",
    message: {
      id: result.message.id,
      senderId: result.message.senderId,
      text: result.message.text,
      createdAt: result.message.createdAt.toISOString(),
    },
  });
}

export type ReviveConversationDeps = {
  limit: (key: string) => Promise<NextResponse | null>;
  revive: (person: Person, conversationId: string) => Promise<ReviveConversationResult>;
};

/** POST /chat/{id}/revive. The one-time "start this conversation again" after 7 days of silence. */
export async function reviveConversationHandler(context: MobileContext, deps: ReviveConversationDeps): Promise<NextResponse> {
  const id = conversationIdFromActionPath(context.request.url);
  if (!id.ok) return mobileError("NOT_FOUND");

  const limited = await deps.limit(`revive-conversation:${context.actor.userId}`);
  if (limited) return limited;

  const result = await deps.revive(personOf(context), id.id);
  if (result.status === "error") {
    return result.code === "NOT_FOUND" ? mobileError("NOT_FOUND") : mobileError("RULE_VIOLATION", { reason: result.code });
  }
  return mobileJson({ status: "revived" });
}
