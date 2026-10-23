import { APP_VERSION_HEADER, getMinAppVersion } from "./version";

/** Test helper: builds a request the way the app sends one (version header, optional cookie and JSON body). */
export function mobileRequest(
  path: string,
  init: {
    method?: string;
    version?: string | null;
    cookie?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Request {
  const headers: Record<string, string> = { ...init.headers };
  const version = init.version === undefined ? getMinAppVersion() : init.version;
  if (version !== null) headers[APP_VERSION_HEADER] = version;
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://overlaps.tech/api/mobile/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Test helper: calls a route handler and returns its status, JSON body and headers in one go. */
export async function callRoute(
  handler: (request: Request) => Promise<Response> | Response,
  request: Request,
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const response = await handler(request);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body, headers: response.headers };
}
