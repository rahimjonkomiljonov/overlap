import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiDeleteWith, apiGet, apiPut } from './api';

type Notifications = typeof NotificationsModule;

/**
 * expo-notifications is loaded only when needed and only if this build has its native parts. Expo Go's own build does
 * not, and importing it there throws at start-up and would take the whole app down; the installed app always has it.
 */
let cached: Notifications | null | undefined;
function notifications(): Notifications | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-notifications') as Notifications;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export type PushStatus = { enabled: boolean; devices: number };
export const fetchPushStatus = () => apiGet<PushStatus>('/push');

/** Why switching push on did not work. `denied` is the person's choice; the rest are about the phone or the build. */
export type EnableFailure = 'unsupported' | 'denied' | 'no_project' | 'no_token' | 'server' | 'offline';
export type EnableResult = { ok: true } | { ok: false; reason: EnableFailure };

const TOKEN_KEY = 'overlap.pushToken';

/** Notifications that arrive while the app is open still show as a banner. */
export function configureForeground(): void {
  notifications()?.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Whether the phone already lets Overlap show notifications, and whether it would still ask. */
export async function readPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const N = notifications();
  if (!N) return { granted: false, canAskAgain: true };
  const p = await N.getPermissionsAsync();
  return { granted: p.granted, canAskAgain: p.canAskAgain };
}

function projectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? null;
}

/**
 * The opt-in: ask the phone's permission (only now, when the person tapped "turn on", never at launch), get this
 * phone's Expo push token and give it to the server. Nothing is sent to Expo, Apple or Google until the server
 * itself is switched on for delivery.
 */
export async function enablePush(): Promise<EnableResult> {
  const Notifications = notifications();
  if (!Notifications) return { ok: false, reason: 'unsupported' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Overlap', importance: Notifications.AndroidImportance.DEFAULT });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ok: false, reason: 'denied' };

  const id = projectId();
  if (!id) return { ok: false, reason: 'no_project' };
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch {
    return { ok: false, reason: 'no_token' };
  }

  const saved = await apiPut<{ status: 'registered' }>('/push/device', { token });
  if (!saved.ok) return { ok: false, reason: saved.code === 'NETWORK' ? 'offline' : 'server' };
  await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);
  return { ok: true };
}

/** Whether push is on for *this* phone: it has a saved token and the server still has a phone registered for the person. */
export async function isPushOnHere(): Promise<boolean | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (!token) return false;
  const status = await fetchPushStatus();
  return status.ok ? status.data.enabled : null;
}

/** The opt-out: the server forgets this phone's token. Returns false when the server could not be reached. */
export async function disablePush(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (!token) return true;
  const removed = await apiDeleteWith<{ status: 'removed' }>('/push/device', { token });
  if (!removed.ok) return false;
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  return true;
}

/**
 * Calls `onTap` with the generic path of a notification the person taps, including the tap that launched the app.
 * Returns how to stop listening. Does nothing where push is unsupported.
 */
export function listenForNotificationTaps(onTap: (path: unknown, id: string) => void): () => void {
  const N = notifications();
  if (!N) return () => undefined;
  const handle = (response: NotificationsModule.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
    onTap(response.notification.request.content.data?.path, response.notification.request.identifier);
  };
  const subscription = N.addNotificationResponseReceivedListener(handle);
  handle(N.getLastNotificationResponse());
  return () => subscription.remove();
}

/**
 * Where a tapped notification opens. The server sends the website path it already uses for the same
 * notification (for example `/ko/waves`); only these three destinations exist.
 */
export function screenForNotificationPath(path: unknown): '/matches' | '/waves' | '/safety' | null {
  if (typeof path !== 'string') return null;
  const clean = path.replace(/^\/ko(?=\/|$)/, '');
  if (clean.startsWith('/matches')) return '/matches';
  if (clean.startsWith('/waves')) return '/waves';
  if (clean.startsWith('/me/safety')) return '/safety';
  return null;
}
