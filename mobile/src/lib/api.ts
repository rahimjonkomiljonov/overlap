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
  | 'RULE_VIOLATION'
  | 'REQUEST_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NETWORK';

/** `reason` is the server's stable code for a broken rule (RULE_VIOLATION), such as TOO_YOUNG or INVALID_INVITE. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ApiErrorCode; reason?: string };

const KNOWN_CODES: readonly string[] = ['UPGRADE_REQUIRED', 'UNAUTHENTICATED', 'ACCOUNT_RESTRICTED', 'FORBIDDEN', 'INVALID_INPUT', 'NOT_FOUND', 'RULE_VIOLATION', 'REQUEST_IN_PROGRESS', 'IDEMPOTENCY_KEY_REUSED', 'RATE_LIMITED', 'INTERNAL'];

/**
 * Calls a mobile API route as the signed-in user. The session cookie comes from the Better Auth
 * client (kept in secure storage) and is sent by hand, because React Native has no cookie jar.
 * Never throws: a failure comes back as `{ ok: false, code }`.
 */
async function apiRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    const cookie = await authClient.getCookie();
    response = await fetch(`${API_URL}/api/mobile/v1${path}`, {
      method,
      headers: { 'X-App-Version': APP_VERSION, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
    });
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const failure = (await response.json().catch(() => null)) as { error?: string; reason?: string } | null;
  const code = failure?.error && KNOWN_CODES.includes(failure.error) ? (failure.error as ApiErrorCode) : 'INTERNAL';
  return { ok: false, code, reason: failure?.reason };
}

export const apiGet = <T>(path: string) => apiRequest<T>('GET', path);
export const apiPost = <T>(path: string, body: unknown) => apiRequest<T>('POST', path, body);
