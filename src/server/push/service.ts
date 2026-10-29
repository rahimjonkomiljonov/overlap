import type { PrismaClient } from "@/generated/prisma/client";
import { EXPO_KEY_MARKER } from "./expo-token";

export type DeviceDb = Pick<PrismaClient, "pushSubscription">;

/** Phones registered for this person (browsers are not counted: they are the website's own toggle). */
export async function deviceCountStep(db: DeviceDb, person: { userId: string }): Promise<number> {
  return db.pushSubscription.count({ where: { userId: person.userId, p256dh: EXPO_KEY_MARKER } });
}

/** Saves this phone's token for the person. A token belongs to one phone: if someone else was signed in on it, it moves. */
export async function registerDeviceStep(db: DeviceDb, person: { userId: string }, token: string): Promise<{ status: "registered" }> {
  await db.pushSubscription.upsert({
    where: { endpoint: token },
    create: { userId: person.userId, endpoint: token, p256dh: EXPO_KEY_MARKER, auth: EXPO_KEY_MARKER },
    update: { userId: person.userId, p256dh: EXPO_KEY_MARKER, auth: EXPO_KEY_MARKER },
  });
  return { status: "registered" };
}

/** Removes the token, only when it is the person's own; someone else's (or an unknown) token is silently left alone. */
export async function unregisterDeviceStep(db: DeviceDb, person: { userId: string }, token: string): Promise<{ status: "removed" }> {
  await db.pushSubscription.deleteMany({ where: { endpoint: token, userId: person.userId } });
  return { status: "removed" };
}
