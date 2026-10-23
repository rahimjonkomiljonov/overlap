import type { NextResponse } from "next/server";
import { getActorForRequest } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { withMobileAuth, type MobileContext, type MobileGuardOptions } from "./guard";
import { withIdempotency } from "./idempotency";
import { prismaIdempotencyStore } from "./idempotency-store";

export type MobileRouteOptions = MobileGuardOptions & {
  /** A send that must not happen twice on a retry: requires an `Idempotency-Key` header (see idempotency.ts). */
  idempotent?: boolean;
};

/**
 * A protected mobile route: `export const POST = mobileRoute("waves.send", async ({ actor }) => ..., { idempotent: true })`.
 * Order of checks: app version, sign-in, account status, then (for sends) the idempotency key.
 * The first argument names the route in logs and as the idempotency scope.
 */
export function mobileRoute(
  route: string,
  handler: (context: MobileContext) => Promise<NextResponse> | NextResponse,
  options: MobileRouteOptions = {},
) {
  const { idempotent, ...guardOptions } = options;
  const inner = idempotent
    ? withIdempotency(route, handler, prismaIdempotencyStore(prisma))
    : handler;
  return withMobileAuth(route, inner, { getActor: getActorForRequest }, guardOptions);
}
