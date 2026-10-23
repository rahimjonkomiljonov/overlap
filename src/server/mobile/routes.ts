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
  /** Needs finished account setup (a campus): profile and campus-data routes. */
  requiresSetup?: boolean;
  /** A query string a valid GET call needs (for example "?type=club"), used by the contract test. */
  sampleQuery?: string;
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
  {
    method: "GET",
    path: "/profile",
    access: "user",
    requiresSetup: true,
    summary:
      "Your own profile and where you are in the wizard: answers, photos, what is still missing, whether Dating is open to you.",
  },
  {
    method: "GET",
    path: "/profile/options",
    access: "user",
    requiresSetup: true,
    summary:
      "The lists and limits the profile screens are built from: departments, years, prompts, interests, values quiz, limits.",
  },
  {
    method: "GET",
    path: "/reference/search",
    access: "user",
    requiresSetup: true,
    sampleQuery: "?type=club&q=a",
    summary: "Search for the pickers: courses, clubs and spots on your campus, and interests.",
  },
  {
    method: "PUT",
    path: "/profile/basics",
    access: "user",
    requiresSetup: true,
    summary:
      "Save name, gender, pronouns, year, department and (only with consent) who you would like to meet.",
  },
  {
    method: "PUT",
    path: "/profile/intents",
    access: "user",
    requiresSetup: true,
    summary:
      "Save what you are here for: Friends, Study, Dating (Dating needs consent and an open cohort).",
  },
  {
    method: "PUT",
    path: "/profile/courses",
    access: "user",
    requiresSetup: true,
    summary: "Save your courses (your own campus only).",
  },
  {
    method: "PUT",
    path: "/profile/clubs",
    access: "user",
    requiresSetup: true,
    summary: "Save your clubs (your own campus only).",
  },
  {
    method: "PUT",
    path: "/profile/spots",
    access: "user",
    requiresSetup: true,
    summary: "Save your favourite campus spots (your own campus only).",
  },
  {
    method: "PUT",
    path: "/profile/free-time",
    access: "user",
    requiresSetup: true,
    summary: "Save your free time slots (two-hour blocks, Monday to Sunday).",
  },
  {
    method: "PUT",
    path: "/profile/interests",
    access: "user",
    requiresSetup: true,
    summary: "Save interest tags and a few free-text interests.",
  },
  {
    method: "PUT",
    path: "/profile/prompts",
    access: "user",
    requiresSetup: true,
    summary: "Save your three prompt answers.",
  },
  {
    method: "PUT",
    path: "/profile/values",
    access: "user",
    requiresSetup: true,
    summary: "Save the eight values-quiz answers.",
  },
  {
    method: "POST",
    path: "/profile/finish",
    access: "user",
    requiresSetup: true,
    summary:
      "Mark the profile finished when every required piece is there; otherwise lists what is missing.",
  },
];
