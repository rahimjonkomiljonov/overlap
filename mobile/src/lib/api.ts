import { authClient } from './auth-client';
import { API_URL, APP_VERSION } from './config';

/** The error codes the server returns (src/server/mobile/guard.ts), plus NETWORK for "could not reach it". */
export type ApiErrorCode =
  | 'UPGRADE_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_RESTRICTED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NETWORK';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ApiErrorCode };

const KNOWN_CODES: readonly string[] = ['UPGRADE_REQUIRED', 'UNAUTHENTICATED', 'ACCOUNT_RESTRICTED', 'FORBIDDEN', 'INVALID_INPUT', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL'];

/**
 * Calls a mobile API route as the signed-in user. The session cookie comes from the Better Auth
 * client (kept in secure storage) and is sent by hand, because React Native has no cookie jar.
 * Never throws: a failure comes back as `{ ok: false, code }`.
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    const cookie = await authClient.getCookie();
    response = await fetch(`${API_URL}/api/mobile/v1${path}`, {
      headers: { 'X-App-Version': APP_VERSION, Cookie: cookie },
      credentials: 'omit',
    });
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  const code = body?.error && KNOWN_CODES.includes(body.error) ? (body.error as ApiErrorCode) : 'INTERNAL';
  return { ok: false, code };
}
