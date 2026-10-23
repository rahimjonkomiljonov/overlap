import Constants from 'expo-constants';

/**
 * Where the backend lives. Set EXPO_PUBLIC_API_URL when running against a local server
 * (see mobile/README.md); the default is production, which is what store builds use.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://overlaps.tech').replace(/\/$/, '');

/**
 * The version of this app, from app.json, sent with every request as `X-App-Version`. The server
 * compares it with its minimum and answers 426 to an app that is too old.
 */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
