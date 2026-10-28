import { prisma } from "@/server/db";
import { chatDetailHandler, CHAT_DETAIL_RATE_LIMIT } from "@/server/mobile/chat";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { getChatDetail } from "@/server/chat/queries";

/** The thread itself: messages oldest first, and icebreakers while it is still empty. Polled every few seconds while the thread is open. */
export const GET = mobileRoute(
  "chat.detail",
  (context) =>
    chatDetailHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, CHAT_DETAIL_RATE_LIMIT),
      getChatDetail: (person, conversationId, locale) => getChatDetail(prisma, conversationId, person.userId, locale),
    }),
  { requireAccountSetup: true },
);
