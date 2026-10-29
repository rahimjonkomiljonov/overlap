import { appendFile } from "node:fs/promises";
import path from "node:path";
import { isExpoPushToken } from "./expo-token";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker (public/sw.js) shows. Generic template text only. */
export interface PushPayload {
  title: string;
  body: string;
  /** Same-origin path the notification opens, e.g. "/matches" or "/ko/waves". */
  url: string;
}

/** "gone" means the push service says this subscription no longer exists (404/410); delete it. */
export type PushResult = "sent" | "logged" | "gone" | "failed";

/** Recomputed per call (see CLAUDE.md: module-level cwd paths break the chdir test pattern). */
export function devPushOutboxPath(): string {
  return path.join(process.cwd(), ".dev-push.jsonl");
}

/** The public half of the VAPID key pair; null until push is configured. Safe to send to the browser. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Same switch as sendEmail(): with VAPID_PRIVATE_KEY unset (the local-only phase) the
 * push is appended to a gitignored dev outbox instead of going to the browser vendor's
 * push service. Setting both VAPID keys turns on real delivery with no caller changes.
 */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  // A phone (Expo token) goes through Expo's push service; a browser goes through Web Push below.
  if (isExpoPushToken(target.endpoint)) {
    const { sendExpoPush } = await import("./expo");
    return sendExpoPush(target.endpoint, payload);
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    const line = JSON.stringify({ endpoint: target.endpoint, ...payload, sentAt: new Date().toISOString() });
    await appendFile(devPushOutboxPath(), `${line}\n`, "utf8");
    return "logged";
  }

  const webpush = (await import("web-push")).default;
  const subject = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL;
  if (!subject) throw new Error("VAPID_SUBJECT (or NEXT_PUBLIC_SITE_URL) must be set alongside the VAPID keys.");

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24, vapidDetails: { subject, publicKey, privateKey } },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    return "failed";
  }
}
