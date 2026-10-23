/**
 * The list of every route under /api/mobile/v1, and the single source of truth for what each one
 * requires. docs/mobile-api.md is checked against it, and contract.test.ts calls every entry
 * without a session to prove protected routes refuse it. A route file that is not listed here, or a
 * listing without a route file, fails a test.
 *
 *  - "public": no sign-in (health only).
 *  - "user": a signed-in, active account.
 *  - "user-or-restricted": signed in; a paused, suspended or banned person may also call it (the
 *    routes that tell people about their own situation). A deleted account never gets in.
 */
export type MobileRouteAccess = "public" | "user" | "user-or-restricted";

export type MobileRouteSpec = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Relative to /api/mobile/v1. */
  path: string;
  access: MobileRouteAccess;
  /** Sends something to another person or changes state that must not happen twice: requires an Idempotency-Key. */
  idempotent?: boolean;
  summary: string;
};

export const MOBILE_ROUTES: readonly MobileRouteSpec[] = [
  {
    method: "GET",
    path: "/health",
    access: "public",
    summary:
      "Is the server up, which API version, the oldest app it accepts, and whether the calling app is new enough.",
  },
  {
    method: "GET",
    path: "/me",
    access: "user-or-restricted",
    summary:
      "Who is signed in: own email, name, role, account status and whether account setup is finished.",
  },
  {
    method: "GET",
    path: "/onboarding",
    access: "user",
    summary:
      "What the app needs for the account-setup screens: is setup done, is an invite code required, the minimum age.",
  },
  {
    method: "POST",
    path: "/onboarding/account",
    access: "user",
    summary:
      "Finish account setup: birth date (age check only, not stored), 19+ and Terms/Privacy consent, the optional sensitive consent, the invite code when required.",
  },
];
