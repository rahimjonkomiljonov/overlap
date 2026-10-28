import type { PrismaClient } from "@/generated/prisma/client";
import { buildLabelMaps, resolveReasons, type ResolvedReason } from "@/server/picks/reasons";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { isBlockedEitherWay } from "@/server/waves/blocks";
import { getIcebreakerReasons } from "./icebreakers";

export type ChatDb = Pick<PrismaClient, "conversation" | "message" | "block">;

export interface ConversationView {
  conversationId: string;
  matchId: string;
  status: "ACTIVE" | "EXPIRED";
  revivedAt: Date | null;
  matchStatus: "ACTIVE" | "UNMATCHED";
  otherUserId: string;
  otherFirstName: string | null;
  otherPhotoUrl: string | null;
  /** Whether the composer/revive controls should be shown at all — false once unmatched. */
  canInteract: boolean;
}

/**
 * The one auth check every chat route/action needs: `conversationId` exists and `actorUserId`
 * is one of its match's two participants. Returns null for "doesn't exist", "not a
 * participant", and "the two participants have blocked each other" alike — never
 * distinguishing these to a caller, so a guessed id can't be used to probe which
 * conversations exist, and a block made after a match formed still enforces G2's mutual
 * invisibility on the conversation itself, not just future picks/waves.
 */
export async function getConversationForActor(db: ChatDb, conversationId: string, actorUserId: string): Promise<ConversationView | null> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      status: true,
      revivedAt: true,
      match: {
        select: {
          id: true,
          status: true,
          userAId: true,
          userBId: true,
          userA: {
            select: {
              profile: {
                select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } },
              },
            },
          },
          userB: {
            select: {
              profile: {
                select: { firstName: true, photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!conversation) return null;

  const { match } = conversation;
  const isUserA = match.userAId === actorUserId;
  if (!isUserA && match.userBId !== actorUserId) return null;

  const other = isUserA ? match.userB : match.userA;
  const otherUserId = isUserA ? match.userBId : match.userAId;

  if (await isBlockedEitherWay(db, actorUserId, otherUserId)) return null;
  const photo = other.profile?.photos[0];

  return {
    conversationId: conversation.id,
    matchId: match.id,
    status: conversation.status,
    revivedAt: conversation.revivedAt,
    matchStatus: match.status,
    otherUserId,
    otherFirstName: other.profile?.firstName ?? null,
    otherPhotoUrl: photo ? await resolvePhotoUrl(photo.storageKey) : null,
    canInteract: match.status === "ACTIVE" && conversation.status === "ACTIVE",
  };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: Date;
}

/** Every message in a conversation, oldest first — the caller must have already authorized `conversationId` via `getConversationForActor`. */
export async function getMessages(db: ChatDb, conversationId: string): Promise<ChatMessage[]> {
  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderId: true, text: true, createdAt: true },
  });
  return messages;
}

export type ChatDetailDb = ChatDb & Pick<PrismaClient, "wave" | "course" | "club" | "interestTag">;

export interface ChatDetail extends ConversationView {
  messages: ChatMessage[];
  /** The shared-overlap "why you two" suggestions (D4) — only computed while the thread is still empty, like the website's chat page. */
  icebreakers: ResolvedReason[];
}

/**
 * One call for everything a chat thread screen needs: the mobile counterpart of the website's
 * `ChatPage` (`src/app/[locale]/(app)/matches/[conversationId]/page.tsx`), which composes the same
 * pieces inline for its own render. Returns null for anything `getConversationForActor` would —
 * doesn't exist, not a participant, or blocked either way.
 */
export async function getChatDetail(db: ChatDetailDb, conversationId: string, userId: string, locale: string): Promise<ChatDetail | null> {
  const conversation = await getConversationForActor(db, conversationId, userId);
  if (!conversation) return null;

  const messages = await getMessages(db, conversationId);
  let icebreakers: ResolvedReason[] = [];
  if (messages.length === 0) {
    const reasons = await getIcebreakerReasons(db, conversationId);
    if (reasons.length > 0) {
      const maps = await buildLabelMaps(db, [reasons]);
      icebreakers = resolveReasons(reasons, maps, locale);
    }
  }

  return { ...conversation, messages, icebreakers };
}
