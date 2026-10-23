import { NextResponse } from "next/server";
import { MIN_APP_VERSION, MOBILE_API_VERSION } from "@/server/mobile/version";

/**
 * The apps' first call: is the server up, which API version does it speak, and what is the oldest
 * app it accepts. Unauthenticated by design (it runs before sign-in, so the upgrade screen can show
 * without an account) and returns nothing about any user. It deliberately does not touch the
 * database: /api/health already does that for uptime monitoring.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", apiVersion: MOBILE_API_VERSION, minAppVersion: MIN_APP_VERSION },
    { headers: { "Cache-Control": "no-store" } },
  );
}
