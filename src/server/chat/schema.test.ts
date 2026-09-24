import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, reviveConversationSchema, sendMessageSchema } from "./schema";

describe("sendMessageSchema", () => {
  it("accepts a normal message", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "c1", text: "hi there" }).success).toBe(true);
  });

  it("trims the text", () => {
    const result = sendMessageSchema.safeParse({ conversationId: "c1", text: "  hi  " });
    expect(result.success).toBe(true);
    expect(result.success && result.data.text).toBe("hi");
  });

  it("rejects an empty message", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "c1", text: "" }).success).toBe(false);
  });

  it("rejects a message that's only whitespace", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "c1", text: "   " }).success).toBe(false);
  });

  it("rejects a message over the max length", () => {
    const result = sendMessageSchema.safeParse({ conversationId: "c1", text: "a".repeat(MAX_MESSAGE_LENGTH + 1) });
    expect(result.success).toBe(false);
  });

  it("accepts exactly the max length", () => {
    expect(sendMessageSchema.safeParse({ conversationId: "c1", text: "a".repeat(MAX_MESSAGE_LENGTH) }).success).toBe(true);
  });

  it("rejects a missing conversationId", () => {
    expect(sendMessageSchema.safeParse({ text: "hi" }).success).toBe(false);
  });
});

describe("reviveConversationSchema", () => {
  it("accepts a conversationId", () => {
    expect(reviveConversationSchema.safeParse({ conversationId: "c1" }).success).toBe(true);
  });

  it("rejects an empty conversationId", () => {
    expect(reviveConversationSchema.safeParse({ conversationId: "" }).success).toBe(false);
  });
});
