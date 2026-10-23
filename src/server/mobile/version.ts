/** Version of the mobile API (the /api/mobile/v1 routes). Bumped only for a breaking change, which gets a new /v2 path. */
export const MOBILE_API_VERSION = 1;

/**
 * Oldest app version the server still accepts. The apps read this from the health route and show an
 * "update the app" screen when they are older (the force-upgrade gate, M02). Raise it only when an
 * old app can no longer work against the server.
 */
export const MIN_APP_VERSION = "0.1.0";

/** True when `version` ("1.2.3") is at least `minimum`. Anything that is not three numbers counts as too old. */
export function isAppVersionSupported(version: string, minimum: string = MIN_APP_VERSION): boolean {
  const parse = (v: string) => {
    const parts = v.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    return parts.map(Number);
  };
  const have = parse(version);
  const need = parse(minimum);
  if (!have || !need) return false;
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] > need[i];
  }
  return true;
}
