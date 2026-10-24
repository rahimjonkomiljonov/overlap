/**
 * The website's local-development storage hands out addresses like "/api/dev-storage/...", which only
 * make sense next to the website. The phone needs a full address, so anything that is not already
 * one is completed with the origin the request came to. Real storage already gives full addresses.
 */
export function absoluteUrl(request: Request, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, new URL(request.url).origin).toString();
}
