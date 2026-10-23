import { API_URL } from './config';

export type Health = { status: 'ok'; apiVersion: number; minAppVersion: string };

/** Asks the server whether it is up and which app version it still accepts. */
export async function fetchHealth(): Promise<Health> {
  const response = await fetch(`${API_URL}/api/mobile/v1/health`);
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return (await response.json()) as Health;
}
