/** Version of the mobile API (the /api/mobile/v1 routes). Bumped only for a breaking change, which gets a new /v2 path. */
export const MOBILE_API_VERSION = 1;

/** The header every app request carries, e.g. `X-App-Version: 0.1.0`. */
export const APP_VERSION_HEADER = "x-app-version";

const DEFAULT_MIN_APP_VERSION = "0.1.0";

/**
 * Oldest app version the server still accepts. The apps read this from the health route and show an
 * "update the app" screen when they are older, and protected routes refuse older apps with 426.
 * Raise it only when an old app can no longer work against the server. `MIN_APP_VERSION` in the
 * environment overrides it (that is also how the upgrade screen is tested without a release).
 */
export function getMinAppVersion(): string {
  const fromEnv = process.env.MIN_APP_VERSION;
  return fromEnv && /^\d+\.\d+\.\d+$/.test(fromEnv) ? fromEnv : DEFAULT_MIN_APP_VERSION;
}

/** True when `version` ("1.2.3") is at least `minimum`. Anything that is not three numbers counts as too old. */
export function isAppVersionSupported(
  version: string | null | undefined,
  minimum: string = getMinAppVersion(),
): boolean {
  const parse = (v: string) => {
    const parts = v.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    return parts.map(Number);
  };
  const have = version ? parse(version) : null;
  const need = parse(minimum);
  if (!have || !need) return false;
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] > need[i];
  }
  return true;
}
