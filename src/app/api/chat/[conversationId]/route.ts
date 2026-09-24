import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { getConversationForActor, getMessages } from "@/server/chat/queries";

/**
 * Polled by the open chat thread every 3s (BUILD_PLAN S15 — Month-1 is polling, not
 * Realtime). Every route handler checks authorization itself: `getConversationForActor`
 * returns null for both "doesn't exist" and "not a participant," so a guessed id can't
 * be used to probe which conversations exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { conversationId } = await params;
  const conversation = await getConversationForActor(prisma, conversationId, actor.userId);
  if (!conversation) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const messages = await getMessages(prisma, conversationId);
  return NextResponse.json({ messages, conversation });
}
