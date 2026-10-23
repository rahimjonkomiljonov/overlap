import type { NextResponse } from "next/server";
import { getActorForRequest } from "@/server/auth/session";
import { withMobileAuth, type MobileContext, type MobileGuardOptions } from "./guard";

/** A protected mobile route: `export const GET = mobileRoute("me", async ({ actor }) => ...)`. */
export function mobileRoute(
  route: string,
  handler: (context: MobileContext) => Promise<NextResponse> | NextResponse,
  options?: MobileGuardOptions,
) {
  return withMobileAuth(route, handler, { getActor: getActorForRequest }, options);
}
