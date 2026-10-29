import { appendFile } from "node:fs/promises";
import { devPushOutboxPath, type PushPayload, type PushResult } from "./send";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Same switch as `sendPush()` and `sendEmail()`: unless `EXPO_PUSH_ENABLED=on` the push is only appended to
 * the gitignored dev outbox, so a local run can never reach Expo, Apple or Google. The payload is the same
 * generic template text the email uses: no names, no chat text, never `interestedIn`. `data.path` tells the
 * app which screen to open when the notification is tapped.
 */
export async function sendExpoPush(token: string, payload: PushPayload): Promise<PushResult> {
  if (process.env.EXPO_PUSH_ENABLED !== "on") {
    const line = JSON.stringify({ endpoint: token, ...payload, sentAt: new Date().toISOString() });
    await appendFile(devPushOutboxPath(), `${line}\n`, "utf8");
    return "logged";
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: { path: payload.url },
        channelId: "default",
        ttl: 60 * 60 * 24,
      }),
    });
    if (!response.ok) return "failed";
    const json = (await response.json()) as { data?: { status?: string; details?: { error?: string } } };
    if (json.data?.status === "ok") return "sent";
    // Expo says the app was uninstalled or the token is stale: the queue deletes it.
    if (json.data?.details?.error === "DeviceNotRegistered") return "gone";
    return "failed";
  } catch {
    return "failed";
  }
}
