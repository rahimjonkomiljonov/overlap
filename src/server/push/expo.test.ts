import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expoPushTokenSchema, isExpoPushToken } from "./expo-token";
import { sendExpoPush } from "./expo";
import { sendPush } from "./send";
import { deviceCountStep, registerDeviceStep, unregisterDeviceStep } from "./service";

const TOKEN = "ExponentPushToken[abcdEFGH1234_-xyz]";
const payload = { title: "New match", body: "You have a new match on Overlap.", url: "/matches" };

describe("Expo push tokens", () => {
  it("accepts both Expo spellings and nothing else", () => {
    expect(isExpoPushToken(TOKEN)).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abcdEFGH1234]")).toBe(true);
    expect(isExpoPushToken("https://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
    expect(expoPushTokenSchema.safeParse(`${TOKEN}\n`).success).toBe(false);
  });
});

describe("sendExpoPush", () => {
  let dir: string;
  let originalCwd: string;
  const saved = { enabled: process.env.EXPO_PUSH_ENABLED, access: process.env.EXPO_ACCESS_TOKEN };

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(path.join(tmpdir(), "expo-push-"));
    process.chdir(dir);
    delete process.env.EXPO_PUSH_ENABLED;
    delete process.env.EXPO_ACCESS_TOKEN;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
    if (saved.enabled === undefined) delete process.env.EXPO_PUSH_ENABLED;
    else process.env.EXPO_PUSH_ENABLED = saved.enabled;
    if (saved.access === undefined) delete process.env.EXPO_ACCESS_TOKEN;
    else process.env.EXPO_ACCESS_TOKEN = saved.access;
  });

  it("only logs to the dev outbox, and never calls Expo, unless switched on", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendExpoPush(TOKEN, payload)).toBe("logged");
    expect(fetchMock).not.toHaveBeenCalled();
    const line = JSON.parse((await readFile(path.join(dir, ".dev-push.jsonl"), "utf8")).trim());
    expect(line).toMatchObject({ endpoint: TOKEN, ...payload });
  });

  it("is reached through sendPush for an Expo token (and so stays logged locally)", async () => {
    expect(await sendPush({ endpoint: TOKEN, p256dh: "expo", auth: "expo" }, payload)).toBe("logged");
  });

  it("when switched on, posts only the generic text and the screen path to Expo", async () => {
    process.env.EXPO_PUSH_ENABLED = "on";
    process.env.EXPO_ACCESS_TOKEN = "secret-access-token";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { status: "ok", id: "t1" } })));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendExpoPush(TOKEN, payload)).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-access-token");
    expect(JSON.parse(init.body as string)).toEqual({
      to: TOKEN,
      title: payload.title,
      body: payload.body,
      data: { path: "/matches" },
      channelId: "default",
      ttl: 86400,
    });
  });

  it("reports a stale token as gone and any other trouble as failed, never throwing", async () => {
    process.env.EXPO_PUSH_ENABLED = "on";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }))));
    expect(await sendExpoPush(TOKEN, payload)).toBe("gone");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { status: "error", details: { error: "MessageRateExceeded" } } }))));
    expect(await sendExpoPush(TOKEN, payload)).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await sendExpoPush(TOKEN, payload)).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await sendExpoPush(TOKEN, payload)).toBe("failed");
  });
});

describe("device steps", () => {
  const fakeDb = () => {
    const rows = new Map<string, { userId: string; endpoint: string; p256dh: string; auth: string }>();
    return {
      rows,
      pushSubscription: {
        upsert: vi.fn(async ({ where, create, update }: { where: { endpoint: string }; create: { userId: string; endpoint: string; p256dh: string; auth: string }; update: Partial<{ userId: string; p256dh: string; auth: string }> }) => {
          const existing = rows.get(where.endpoint);
          rows.set(where.endpoint, existing ? { ...existing, ...update } : create);
        }),
        deleteMany: vi.fn(async ({ where }: { where: { endpoint: string; userId: string } }) => {
          const row = rows.get(where.endpoint);
          if (row && row.userId === where.userId) rows.delete(where.endpoint);
        }),
        count: vi.fn(async ({ where }: { where: { userId: string; p256dh: string } }) => [...rows.values()].filter((r) => r.userId === where.userId && r.p256dh === where.p256dh).length),
      },
    };
  };

  it("registers a token once, moves it to a new owner, and counts only the caller's phones", async () => {
    const db = fakeDb();
    await registerDeviceStep(db as never, { userId: "a" }, TOKEN);
    await registerDeviceStep(db as never, { userId: "a" }, TOKEN);
    expect(db.rows.size).toBe(1);
    expect(await deviceCountStep(db as never, { userId: "a" })).toBe(1);
    await registerDeviceStep(db as never, { userId: "b" }, TOKEN);
    expect(await deviceCountStep(db as never, { userId: "a" })).toBe(0);
    expect(await deviceCountStep(db as never, { userId: "b" })).toBe(1);
  });

  it("removes only the caller's own token", async () => {
    const db = fakeDb();
    await registerDeviceStep(db as never, { userId: "a" }, TOKEN);
    await unregisterDeviceStep(db as never, { userId: "b" }, TOKEN);
    expect(db.rows.size).toBe(1);
    await unregisterDeviceStep(db as never, { userId: "a" }, TOKEN);
    expect(db.rows.size).toBe(0);
  });
});
