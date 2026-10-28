import { prisma } from "@/server/db";
import { reviveConversationHandler, REVIVE_CONVERSATION_RATE_LIMIT } from "@/server/mobile/chat";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { reviveConversationStep } from "@/server/chat/service";

/** D5's "one revive": restarts a conversation that went silent for 7 days. Refuses if it isn't actually expired or has already been revived once. */
export const POST = mobileRoute(
  "chat.revive",
  (context) =>
    reviveConversationHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, REVIVE_CONVERSATION_RATE_LIMIT),
      revive: (person, conversationId) => reviveConversationStep(prisma, person, conversationId),
    }),
  { requireAccountSetup: true },
);
