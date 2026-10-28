import { File } from 'expo-file-system';

import { authClient } from './auth-client';
import { API_URL, APP_VERSION } from './config';

/** The error codes the server returns (src/server/mobile/guard.ts), plus NETWORK for "could not reach it". */
export type ApiErrorCode =
  | 'UPGRADE_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_RESTRICTED'
  | 'FORBIDDEN'
  | 'ACCOUNT_SETUP_REQUIRED'
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

const KNOWN_CODES: readonly string[] = [
  'UPGRADE_REQUIRED',
  'UNAUTHENTICATED',
  'ACCOUNT_RESTRICTED',
  'FORBIDDEN',
  'ACCOUNT_SETUP_REQUIRED',
  'INVALID_INPUT',
  'NOT_FOUND',
  'RULE_VIOLATION',
  'REQUEST_IN_PROGRESS',
  'IDEMPOTENCY_KEY_REUSED',
  'RATE_LIMITED',
  'INTERNAL',
];

/** A picture on the phone, ready to upload. */
export type UploadFile = { uri: string; name: string; type: string };

type RequestBody = { json: unknown } | { file: UploadFile; field: string } | undefined;

/**
 * Calls a mobile API route as the signed-in user. The session cookie comes from the Better Auth
 * client (kept in secure storage) and is sent by hand, because React Native has no cookie jar.
 * Never throws: a failure comes back as `{ ok: false, code }`.
 */
async function apiRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: RequestBody, extraHeaders?: Record<string, string>): Promise<ApiResult<T>> {
  let response: Response;
  try {
    const cookie = await authClient.getCookie();
    const headers: Record<string, string> = { 'X-App-Version': APP_VERSION, Cookie: cookie, ...extraHeaders };
    let payload: string | FormData | undefined;
    if (body && 'json' in body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body) {
      // Multipart. Expo's fetch cannot send React Native's `{ uri, name, type }` pictures: it needs a real file object,
      // which expo-file-system's `File` is (its type comes from the .jpg ending). The Content-Type (with its boundary) is set by fetch itself.
      const form = new FormData();
      form.append(body.field, new File(body.file.uri) as unknown as Blob);
      payload = form;
    }
    response = await fetch(`${API_URL}/api/mobile/v1${path}`, { method, headers, body: payload, credentials: 'omit' });
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const failure = (await response.json().catch(() => null)) as { error?: string; reason?: string } | null;
  const code = failure?.error && KNOWN_CODES.includes(failure.error) ? (failure.error as ApiErrorCode) : 'INTERNAL';
  return { ok: false, code, reason: failure?.reason };
}

export const apiGet = <T>(path: string) => apiRequest<T>('GET', path);
export const apiPost = <T>(path: string, body: unknown) => apiRequest<T>('POST', path, { json: body });
/**
 * A send the server must not apply twice (BUILD_PLAN M07 pocket waves, M06 pass). Pass the same `idempotencyKey` on a retry of
 * the same action and the server replays its first answer; use a new key for a new action.
 */
export const apiPostOnce = <T>(path: string, idempotencyKey: string, body: unknown = {}) => apiRequest<T>('POST', path, { json: body }, { 'Idempotency-Key': idempotencyKey });
export const apiPut = <T>(path: string, body: unknown) => apiRequest<T>('PUT', path, { json: body });
export const apiDelete = <T>(path: string) => apiRequest<T>('DELETE', path);
export const apiUpload = <T>(path: string, field: string, file: UploadFile) => apiRequest<T>('POST', path, { file, field });

/**
 * How to load a picture the server gave us. Pictures on our own server need the session cookie;
 * pictures on the storage provider's address carry their own short-lived signature, and the cookie
 * must never be sent there: that would hand the session to a third party.
 */
export function imageSource(url: string, cookie: string): { uri: string; headers?: Record<string, string> } {
  return url.startsWith(`${API_URL}/`) ? { uri: url, headers: { Cookie: cookie } } : { uri: url };
}
