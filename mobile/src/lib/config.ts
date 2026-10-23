/**
 * Where the backend lives. Set EXPO_PUBLIC_API_URL when running against a local server
 * (see mobile/README.md); the default is production, which is what store builds use.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://overlaps.tech').replace(/\/$/, '');

/** The version of this app, compared with the server's minimum (the force-upgrade gate, M02). */
export const APP_VERSION = '0.1.0';
