import { NextResponse } from "next/server";
import { MOBILE_API_VERSION } from "./version";

/** Tells the app which version of the mobile API answered. Sent on every response, errors included. */
export const API_VERSION_HEADER = "x-api-version";

/**
 * Every success body from the mobile API goes through here, so every response carries the same
 * headers: never cached (these are per-person answers) and stamped with the API version.
 */
export function mobileJson(
  data: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      [API_VERSION_HEADER]: String(MOBILE_API_VERSION),
      ...init.headers,
    },
  });
}
