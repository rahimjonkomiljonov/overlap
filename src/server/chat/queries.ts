import type { PrismaClient } from "@/generated/prisma/client";
import { resolvePhotoUrl } from "@/server/storage/photos";
import { isBlockedEitherWay } from "@/server/waves/blocks";

export type ChatDb = Pick<PrismaClient, "conversation" | "message" | "block">;

export interface ConversationView {
  conversationId: string;
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
