import * as z from "zod";

/** An Expo push token, as `getExpoPushTokenAsync` returns it: `ExponentPushToken[...]` (older) or `ExpoPushToken[...]`. */
const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/;

export function isExpoPushToken(value: string): boolean {
  return EXPO_TOKEN.test(value);
}

export const expoPushTokenSchema = z.string().max(200).regex(EXPO_TOKEN, "not an Expo push token");

/**
 * A phone's token is stored in the same `PushSubscription` table as a browser's, as `endpoint`, with the
 * two key columns set to this marker (they only mean something to Web Push). That way account deletion,
 * the data export and the notification queue already cover phones.
 */
export const EXPO_KEY_MARKER = "expo";
