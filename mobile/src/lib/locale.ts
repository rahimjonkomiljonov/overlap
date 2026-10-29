import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

export type Locale = 'en' | 'ko';
/** What the person picked: a language, or "follow the phone". */
export type LocaleChoice = 'phone' | Locale;

const KEY = 'overlap.language';

let choice: LocaleChoice = 'phone';
const listeners = new Set<() => void>();

/** The phone's language, as far as the app speaks it: Korean on a Korean phone, English on everything else. */
export function phoneLocale(): Locale {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  } catch {
    return 'en';
  }
}

export const getChoice = (): LocaleChoice => choice;
export const getLocale = (): Locale => (choice === 'phone' ? phoneLocale() : choice);

function announce() {
  for (const listener of listeners) listener();
}

/** Reads the saved choice once at start-up. A phone without secure storage just follows the phone. */
export async function loadChoice(): Promise<void> {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (saved === 'en' || saved === 'ko' || saved === 'phone') choice = saved;
  announce();
}

export async function setChoice(next: LocaleChoice): Promise<void> {
  choice = next;
  announce();
  await SecureStore.setItemAsync(KEY, next).catch(() => undefined);
}

/**
 * Switching language rebuilds the whole app, which would drop the person back on the first tab. The screen that
 * changes the language says where to return to, and the rebuilt app takes it once.
 */
let returnTo: '/me' | null = null;
export const returnAfterSwitch = (path: '/me') => {
  returnTo = path;
};
export function takeReturnPath(): '/me' | null {
  const path = returnTo;
  returnTo = null;
  return path;
}

/** Re-renders the caller when the language changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocale,
    getLocale,
  );
}

/** One of two texts by the current language: Korean when the language is Korean and there is a Korean text, else English first. */
export function localized(ko: string | null | undefined, en: string | null | undefined): string {
  if (getLocale() === 'ko') return ko || en || '';
  return en || ko || '';
}
