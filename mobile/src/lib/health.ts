import { API_URL, APP_VERSION } from './config';

export type Health = { status: 'ok'; apiVersion: number; minAppVersion: string; supported?: boolean };

/** Asks the server whether it is up, which app version it still accepts, and whether this app is new enough. */
export async function fetchHealth(): Promise<Health> {
  const response = await fetch(`${API_URL}/api/mobile/v1/health`, { headers: { 'X-App-Version': APP_VERSION } });
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return (await response.json()) as Health;
}
