import type { NextResponse } from "next/server";
import { UserStatus } from "@/generated/prisma/enums";
import { AuthError, requireUser, type Actor } from "@/server/auth/authz";
import { captureError } from "@/server/logging";
import { mobileJson } from "./responses";
import { APP_VERSION_HEADER, isAppVersionSupported } from "./version";

/**
 * Every error the mobile API returns is `{ "error": "<CODE>" }` with a matching HTTP status. The
 * apps switch on the code and write their own (Korean/English) text, the same way the web's server
 * actions return codes instead of copy.
 */
export const MOBILE_ERRORS = {
  UPGRADE_REQUIRED: 426,
  UNAUTHENTICATED: 401,
  ACCOUNT_RESTRICTED: 403,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  REQUEST_IN_PROGRESS: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;
export type MobileErrorCode = keyof typeof MOBILE_ERRORS;

/** Which part of the request was wrong and how, never the value that was sent. */
export type FieldProblem = { name: string; problem: string };

export function mobileError(
  code: MobileErrorCode,
  extra: { fields?: FieldProblem[] } = {},
): NextResponse {
  return mobileJson({ error: code, ...extra }, { status: MOBILE_ERRORS[code] });
}

export type MobileContext = { actor: NonNullable<Actor>; request: Request };
export type MobileGuardDeps = { getActor: (request: Request) => Promise<Actor> };
export type MobileGuardOptions = {
  /**
   * Let a paused, suspended or banned account through (a deleted one never gets in). Only for routes
   * that tell people about their own situation, such as "who am I" and the appeal screens, so the app
   * can explain the restriction instead of showing a generic error.
   */
  allowRestricted?: boolean;
};

/**
 * Wraps a mobile route handler: refuses apps older than the minimum version (426), requires a
 * signed-in, active account (401 / 403) and turns anything unexpected into a logged, scrubbed 500.
 * Every protected route goes through here, so none of them can forget the checks (each route
 * handler must check authorization itself; the proxy only routes locales).
 *
 * The version check comes first on purpose: an app too old to understand the sign-in or error
 * formats must be told to update before anything else.
 */
export function withMobileAuth(
  route: string,
  handler: (context: MobileContext) => Promise<NextResponse> | NextResponse,
  deps: MobileGuardDeps,
  options: MobileGuardOptions = {},
): (request: Request) => Promise<NextResponse> {
  return async (request) => {
    if (!isAppVersionSupported(request.headers.get(APP_VERSION_HEADER)))
      return mobileError("UPGRADE_REQUIRED");
    try {
      const actor = await deps.getActor(request);
      if (options.allowRestricted) {
        // signed in is enough, but an account that has been deleted is treated as signed out
        if (!actor || actor.status === UserStatus.DELETED)
          throw new AuthError("UNAUTHENTICATED", "Sign-in required.");
      } else {
        requireUser(actor);
      }
      return await handler({ actor, request });
    } catch (error) {
      if (error instanceof AuthError)
        return mobileError(
          error.code === "UNAUTHENTICATED"
            ? "UNAUTHENTICATED"
            : error.code === "FORBIDDEN"
              ? "FORBIDDEN"
              : "ACCOUNT_RESTRICTED",
        );
      captureError(`mobile.${route}`, error);
      return mobileError("INTERNAL");
    }
  };
}
