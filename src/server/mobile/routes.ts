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
  /** For a GET route with a dynamic segment ([id]): a real-shaped path the contract test calls instead. */
  samplePath?: string;
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
  {
    method: "POST",
    path: "/profile/photos",
    access: "user",
    requiresSetup: true,
    summary:
      'Add one profile photo (multipart field "photo", at most 4 MB, three to six per profile). Resized and stripped of metadata.',
  },
  {
    method: "DELETE",
    path: "/profile/photos/[photoId]",
    access: "user",
    requiresSetup: true,
    summary: "Remove one of your own photos (a finished profile keeps its three-photo minimum).",
  },
  {
    method: "GET",
    path: "/verification",
    access: "user",
    requiresSetup: true,
    summary:
      "Where your own verification stands: unsubmitted, pending, rejected with the reason, or verified.",
  },
  {
    method: "POST",
    path: "/verification/selfie",
    access: "user",
    requiresSetup: true,
    summary:
      'Submit a verification selfie (multipart field "selfie", at most 4 MB). Private to you and the reviewing moderator.',
  },
  {
    method: "GET",
    path: "/picks",
    access: "user",
    requiresSetup: true,
    summary:
      "Today's picks for every mode you opted into, undecided only: photos, prompts, the reasons you overlap, first name, year and major. Same batch as the website.",
  },
  {
    method: "POST",
    path: "/picks/[batchItemId]/pass",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    summary: "Pass on one of your own picks. It is never listed again.",
  },
  {
    method: "POST",
    path: "/picks/[batchItemId]/wave",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/picks/sample-batch-item/wave",
    summary:
      "Wave at one of your own undecided picks, with an optional note. Same 8/day cap, block check and mutual-match rule as the website's wave composer.",
  },
  {
    method: "GET",
    path: "/waves",
    access: "user",
    requiresSetup: true,
    summary: "Pending waves sent to you, most recent first — the \"Waved at you\" inbox.",
  },
  {
    method: "POST",
    path: "/waves/[waveId]/wave-back",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/waves/sample-wave-id/wave-back",
    summary: "Wave back at whoever sent this wave. Completes the pair into a match right away.",
  },
  {
    method: "POST",
    path: "/waves/[waveId]/decline",
    access: "user",
    requiresSetup: true,
    samplePath: "/waves/sample-wave-id/decline",
    summary: "Dismiss an incoming wave without waving back. No cost against either side's cap.",
  },
  {
    method: "GET",
    path: "/pockets",
    access: "user",
    requiresSetup: true,
    summary:
      "Your own course and club pockets, each with how many people you could meet there. Same data as the website's /pockets.",
  },
  {
    method: "PUT",
    path: "/pockets/visibility",
    access: "user",
    requiresSetup: true,
    summary: "Turn Campus Pockets on or off for yourself (off by default).",
  },
  {
    method: "GET",
    path: "/pockets/[kind]/[pocketId]",
    access: "user",
    requiresSetup: true,
    samplePath: "/pockets/course/sample-pocket",
    summary:
      "One pocket in full: everyone you could meet there, in join order, each with whether you have waved or matched.",
  },
  {
    method: "POST",
    path: "/pockets/wave",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    summary:
      "Wave at someone you can currently see in one of your pockets. Same 8/day cap and mutual-match rule as a wave from Daily Picks.",
  },
  {
    method: "GET",
    path: "/matches",
    access: "user",
    requiresSetup: true,
    summary: "Every active match, most recent first — the chat entry point. Same data as the website's /matches.",
  },
  {
    method: "POST",
    path: "/matches/[matchId]/unmatch",
    access: "user",
    requiresSetup: true,
    samplePath: "/matches/sample-match-id/unmatch",
    summary: "Ends an active match for good. No un-unmatch.",
  },
  {
    method: "GET",
    path: "/chat/[conversationId]",
    access: "user",
    requiresSetup: true,
    samplePath: "/chat/sample-conversation-id",
    summary:
      "The thread itself: messages oldest first, and icebreakers (the reasons you overlap) while it is still empty. Polled every few seconds while the thread is open.",
  },
  {
    method: "POST",
    path: "/chat/[conversationId]/messages",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/chat/sample-conversation-id/messages",
    summary: "Sends a message in an already-matched, still-interactable conversation.",
  },
  {
    method: "POST",
    path: "/chat/[conversationId]/revive",
    access: "user",
    requiresSetup: true,
    samplePath: "/chat/sample-conversation-id/revive",
    summary:
      "The one-time \"start this conversation again\" after 7 days of silence. Refuses if it isn't actually expired or has already been revived once.",
  },
];
