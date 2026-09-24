import * as z from "zod";

export const MAX_MESSAGE_LENGTH = 2000;

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const reviveConversationSchema = z.object({
  conversationId: z.string().min(1),
});
