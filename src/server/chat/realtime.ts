import { createHmac } from "node:crypto";
import type { ChatMessage } from "./queries";

/**
 * Fast-follow: realtime chat via Supabase Realtime **Broadcast**, not Postgres Changes.
 * `messages`/`conversations` have no Row-Level-Security policies (Prisma manages them
 * directly, and auth is Better Auth, not Supabase Auth, so there's no Supabase JWT to
 * authorize RLS with) — Postgres Changes would inherit that missing RLS and broadcast
 * every user's chat text to every connected client. Broadcast sidesteps this: only the
 * server ever publishes (via its own secret-key client, after `sendMessage` has already
 * authorized and persisted the message), and the channel name is an HMAC of the
 * conversation id, unguessable without `CHAT_CHANNEL_SECRET` — the browser only learns
 * it after passing `getConversationForActor`'s real auth check, the same way it already
 * learns `conversationId` itself. Same "unguessable token is the access control" shape
 * as S17's meetup share links, not a new security model for this codebase.
 *
 * Same local-only-phase pattern as Storage (src/server/storage/blob.ts): falls back to
 * nothing (callers keep polling) when unconfigured, which is what CI's e2e run — no
 * Supabase credentials there either — actually exercises.
 */

export function isChatRealtimeConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.CHAT_CHANNEL_SECRET &&
      process.env.SUPABASE_SECRET_KEY,
  );
}

/** Deterministic per-conversation channel name. Never derivable without CHAT_CHANNEL_SECRET. */
export function chatChannelName(conversationId: string): string {
  const digest = createHmac("sha256", requireSecret()).update(conversationId).digest("base64url");
  return `chat-${digest.slice(0, 32)}`;
}

function requireSecret(): string {
  const secret = process.env.CHAT_CHANNEL_SECRET;
  if (!secret) {
    throw new Error("CHAT_CHANNEL_SECRET is not set — call isChatRealtimeConfigured() first.");
  }
  return secret;
}

/**
 * Best-effort: a Realtime outage must never break sending a message, since the message
 * is already durably persisted by the time this runs. Callers don't need to check
 * isChatRealtimeConfigured() themselves — this no-ops when unconfigured, same as
 * blob.ts's upload/delete helpers check internally rather than at every call site.
 */
export async function broadcastNewMessage(conversationId: string, message: ChatMessage): Promise<void> {
  if (!isChatRealtimeConfigured()) return;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    const channel = client.channel(chatChannelName(conversationId));
    // httpSend(), not send(): the server never subscribes to this channel (it only ever
    // publishes), and plain send() without a subscription silently falls back to this
    // same REST path anyway — Supabase's own deprecation notice says to call it directly.
    await channel.httpSend("message", {
      id: message.id,
      senderId: message.senderId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    });
    await client.removeChannel(channel);
  } catch (error) {
    console.error("broadcastNewMessage failed (chat continues to work via polling):", error);
  }
}
