import type { NextResponse } from "next/server";
import * as z from "zod";
import { expoPushTokenSchema } from "@/server/push/expo-token";
import type { MobileContext } from "./guard";
import { mobileJson } from "./responses";
import { readJson } from "./validate";

export const PUSH_READ_RATE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
export const PUSH_WRITE_RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

type Limit = { limit: (key: string) => Promise<NextResponse | null> };

export type PushStatusDeps = Limit & { countDevices: (person: { userId: string }) => Promise<number> };

/** GET /push: how many phones are registered for this person (the app's on/off switch reads `enabled`). */
export async function pushStatusHandler(context: MobileContext, deps: PushStatusDeps): Promise<NextResponse> {
  const limited = await deps.limit(`push-read:${context.actor.userId}`);
  if (limited) return limited;

  const devices = await deps.countDevices({ userId: context.actor.userId });
  return mobileJson({ enabled: devices > 0, devices });
}

const deviceBody = z.strictObject({ token: expoPushTokenSchema });

export type RegisterDeviceDeps = Limit & { register: (person: { userId: string }, token: string) => Promise<{ status: "registered" }> };

/** PUT /push/device: save this phone's Expo push token (the opt-in itself). Repeating it changes nothing. */
export async function registerDeviceHandler(context: MobileContext, deps: RegisterDeviceDeps): Promise<NextResponse> {
  const body = await readJson(context.request, deviceBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`push-write:${context.actor.userId}`);
  if (limited) return limited;

  await deps.register({ userId: context.actor.userId }, body.data.token);
  return mobileJson({ status: "registered" });
}

export type UnregisterDeviceDeps = Limit & { unregister: (person: { userId: string }, token: string) => Promise<{ status: "removed" }> };

/** DELETE /push/device: forget this phone's token (the opt-out). Only ever removes the caller's own token. */
export async function unregisterDeviceHandler(context: MobileContext, deps: UnregisterDeviceDeps): Promise<NextResponse> {
  const body = await readJson(context.request, deviceBody);
  if (!body.ok) return body.response;
  const limited = await deps.limit(`push-write:${context.actor.userId}`);
  if (limited) return limited;

  await deps.unregister({ userId: context.actor.userId }, body.data.token);
  return mobileJson({ status: "removed" });
}
