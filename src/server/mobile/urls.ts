/**
 * The website's local-development storage hands out addresses like "/api/dev-storage/...", which only
 * make sense next to the website. The phone needs a full address, so anything that is not already
 * one is completed with the origin the request came to. Real storage already gives full addresses.
 */
export function absoluteUrl(request: Request, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, originOf(request)).toString();
}

/**
 * The origin the caller used. `request.url` is not enough: the development server rebuilds it from its own
 * host name ("localhost"), which a phone or emulator cannot reach. The Host header (or the proxy's
 * forwarded one) is what the caller actually typed.
 */
function originOf(request: Request): string {
  const own = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return own.origin;
  const proto =
    request.headers.get("x-forwarded-proto") === "https" ? "https" : own.protocol.replace(":", "");
  return `${proto}://${host}`;
}
