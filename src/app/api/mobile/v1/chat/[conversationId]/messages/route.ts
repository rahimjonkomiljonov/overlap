import { prisma } from "@/server/db";
import { sendMessageHandler, SEND_MESSAGE_RATE_LIMIT } from "@/server/mobile/chat";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { sendMessageStep } from "@/server/chat/service";

/** Sends a message in an already-matched, still-interactable conversation. */
export const POST = mobileRoute(
  "chat.send",
  (context) =>
    sendMessageHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, SEND_MESSAGE_RATE_LIMIT),
      send: (person, conversationId, text) => sendMessageStep(prisma, person, conversationId, text),
    }),
  { requireAccountSetup: true, idempotent: true },
);
