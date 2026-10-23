import { NextResponse } from "next/server";
import { APP_VERSION_HEADER, getMinAppVersion, isAppVersionSupported, MOBILE_API_VERSION } from "@/server/mobile/version";

/**
 * The apps' first call: is the server up, which API version does it speak, what is the oldest app
 * it accepts, and is the calling app (its `X-App-Version` header) new enough. Unauthenticated by
 * design (it runs before sign-in, so the upgrade screen can show without an account) and returns
 * nothing about any user. It deliberately does not touch the database: /api/health already does
 * that for uptime monitoring.
 */
export function GET(request: Request) {
  const minAppVersion = getMinAppVersion();
  return NextResponse.json(
    {
      status: "ok",
      apiVersion: MOBILE_API_VERSION,
      minAppVersion,
      supported: isAppVersionSupported(request.headers.get(APP_VERSION_HEADER), minAppVersion),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
