import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePushSubscriptionSchema } from "./schema";
import { getVapidPublicKey, sendPush } from "./send";

describe("sendPush without VAPID keys (local-only phase)", () => {
  let dir: string;
  let originalCwd: string;
  const saved = { pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(path.join(tmpdir(), "push-"));
    process.chdir(dir);
    delete process.env.VAPID_PRIVATE_KEY;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
    if (saved.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = saved.pub;
    if (saved.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = saved.priv;
  });

  it("logs to the dev push outbox instead of contacting a push service", async () => {
    process.env.VAPID_PUBLIC_KEY = "public-only";
    const result = await sendPush(
      { endpoint: "https://push.example/x", p256dh: "p", auth: "a" },
      { title: "T", body: "B", url: "/matches" },
    );
    expect(result).toBe("logged");
    const lines = (await readFile(path.join(dir, ".dev-push.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ endpoint: "https://push.example/x", title: "T", url: "/matches" });
  });

  it("exposes only the public key, and null when unset", () => {
    process.env.VAPID_PUBLIC_KEY = "public-only";
    expect(getVapidPublicKey()).toBe("public-only");
    delete process.env.VAPID_PUBLIC_KEY;
    expect(getVapidPublicKey()).toBeNull();
  });
});

describe("savePushSubscriptionSchema", () => {
  const valid = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };

  it("accepts a browser subscription", () => {
    expect(savePushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-https endpoints and missing keys", () => {
    expect(savePushSubscriptionSchema.safeParse({ ...valid, endpoint: "http://push.example/x" }).success).toBe(false);
    expect(savePushSubscriptionSchema.safeParse({ ...valid, endpoint: "javascript:alert(1)" }).success).toBe(false);
    expect(savePushSubscriptionSchema.safeParse({ endpoint: valid.endpoint, keys: { p256dh: "k" } }).success).toBe(false);
  });
});
