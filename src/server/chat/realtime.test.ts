import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chatChannelName, isChatRealtimeConfigured } from "./realtime";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "CHAT_CHANNEL_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isChatRealtimeConfigured", () => {
  it("is false when any required var is missing", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(isChatRealtimeConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub";
    process.env.SUPABASE_SECRET_KEY = "secret";
    expect(isChatRealtimeConfigured()).toBe(false); // CHAT_CHANNEL_SECRET still missing
  });

  it("is true when every required var is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub";
    process.env.SUPABASE_SECRET_KEY = "secret";
    process.env.CHAT_CHANNEL_SECRET = "a".repeat(64);
    expect(isChatRealtimeConfigured()).toBe(true);
  });
});

describe("chatChannelName", () => {
  beforeEach(() => {
    process.env.CHAT_CHANNEL_SECRET = "a".repeat(64);
  });

  it("is deterministic for the same conversation id", () => {
    expect(chatChannelName("convo-1")).toBe(chatChannelName("convo-1"));
  });

  it("differs between conversation ids", () => {
    expect(chatChannelName("convo-1")).not.toBe(chatChannelName("convo-2"));
  });

  it("never contains the raw conversation id", () => {
    const id = "a-very-guessable-conversation-id";
    expect(chatChannelName(id)).not.toContain(id);
  });

  it("differs when the secret differs (not derivable without it)", () => {
    const withSecretA = chatChannelName("convo-1");
    process.env.CHAT_CHANNEL_SECRET = "b".repeat(64);
    const withSecretB = chatChannelName("convo-1");
    expect(withSecretA).not.toBe(withSecretB);
  });

  it("throws instead of silently deriving a name without a secret", () => {
    delete process.env.CHAT_CHANNEL_SECRET;
    expect(() => chatChannelName("convo-1")).toThrow();
  });
});
