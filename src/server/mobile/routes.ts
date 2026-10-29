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
  {
    method: "GET",
    path: "/meetup/[matchId]",
    access: "user",
    requiresSetup: true,
    samplePath: "/meetup/sample-match-id",
    summary:
      "The meetup planner for one match: the live proposal, or the suggested times and Safe Spots to make one, plus the emergency numbers.",
  },
  {
    method: "POST",
    path: "/meetup/[matchId]/propose",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/meetup/sample-match-id/propose",
    summary: "Propose one of the suggested times at a Safe Spot. The other person then accepts or declines.",
  },
  {
    method: "POST",
    path: "/meetup/[matchId]/propose-custom",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/meetup/sample-match-id/propose-custom",
    summary: "Suggest your own time (a day, a daytime block and a Safe Spot) when the two of you share no free time.",
  },
  {
    method: "POST",
    path: "/meetup/proposals/[proposalId]/respond",
    access: "user",
    requiresSetup: true,
    samplePath: "/meetup/proposals/sample-proposal-id/respond",
    summary: "The other person accepts or declines a proposed meetup.",
  },
  {
    method: "POST",
    path: "/meetup/proposals/[proposalId]/cancel",
    access: "user",
    requiresSetup: true,
    samplePath: "/meetup/proposals/sample-proposal-id/cancel",
    summary: "Either person calls off a confirmed meetup.",
  },
  {
    method: "POST",
    path: "/meetup/proposals/[proposalId]/feedback",
    access: "user",
    requiresSetup: true,
    samplePath: "/meetup/proposals/sample-proposal-id/feedback",
    summary: "The private after-meetup check-in. Never files a report on its own.",
  },
  {
    method: "POST",
    path: "/meetup/proposals/[proposalId]/share-link",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/meetup/proposals/sample-proposal-id/share-link",
    summary: "A text-only, expiring \"share my plans\" link for a trusted contact.",
  },
  {
    method: "GET",
    path: "/events",
    access: "user",
    requiresSetup: true,
    summary:
      "Upcoming and ongoing events on your campus, plus ones still in their 48-hour connect window, with how many are going and whether you are. Creating events stays on the web.",
  },
  {
    method: "GET",
    path: "/events/[eventId]",
    access: "user",
    requiresSetup: true,
    samplePath: "/events/sample-event-id",
    summary:
      "One event: details, your RSVP, and who is going (opted-in guests only, verified viewers only, most in common first).",
  },
  {
    method: "PUT",
    path: "/events/[eventId]/rsvp",
    access: "user",
    requiresSetup: true,
    samplePath: "/events/sample-event-id/rsvp",
    summary: "Going or not, and whether to be listed to other verified guests. Capacity and the event's phase are enforced by the server.",
  },
  {
    method: "POST",
    path: "/events/[eventId]/connect",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    samplePath: "/events/sample-event-id/connect",
    summary: "\"We met\": pick a guest in the 48 hours after the event. A mutual pick makes a match with a chat.",
  },
  {
    method: "GET",
    path: "/safety",
    access: "user-or-restricted",
    requiresSetup: true,
    summary:
      "Your own safety state: pause and incognito, the blocked and hidden lists, courses and clubs to hide from, actions taken on your account and how to appeal, and the reach-limit status. Open to a restricted account so it can see why.",
  },
  {
    method: "PUT",
    path: "/safety/paused",
    access: "user-or-restricted",
    requiresSetup: true,
    summary:
      "Pause or unpause the profile. Open to a paused account so it can come back; a suspended or banned account is refused.",
  },
  {
    method: "PUT",
    path: "/safety/incognito",
    access: "user",
    requiresSetup: true,
    summary:
      "Incognito mode: browse and act as usual but never appear in anyone else's picks.",
  },
  {
    method: "POST",
    path: "/safety/appeals",
    access: "user-or-restricted",
    requiresSetup: true,
    summary:
      "The one-time appeal on a moderation action taken against you. Open to a suspended or banned account.",
  },
  {
    method: "POST",
    path: "/safety/trust-appeals",
    access: "user",
    requiresSetup: true,
    summary:
      "Appeal a limit on how widely you are shown. One open appeal at a time.",
  },
  {
    method: "POST",
    path: "/reports",
    access: "user",
    idempotent: true,
    requiresSetup: true,
    summary:
      "Report a person. They are hidden from you immediately, before any moderator decision; from a chat, the last 50 messages go along as evidence.",
  },
  {
    method: "POST",
    path: "/blocks",
    access: "user",
    requiresSetup: true,
    summary:
      "Block a person: mutual invisibility, permanent unless undone.",
  },
  {
    method: "DELETE",
    path: "/blocks/[userId]",
    access: "user",
    requiresSetup: true,
    samplePath: "/blocks/sample-user-id",
    summary:
      "Unblock a person.",
  },
  {
    method: "POST",
    path: "/hides/course",
    access: "user",
    requiresSetup: true,
    summary:
      "Hide everyone currently in one of your courses (one rule per person).",
  },
  {
    method: "POST",
    path: "/hides/club",
    access: "user",
    requiresSetup: true,
    summary:
      "Hide everyone currently in one of your clubs (one rule per person).",
  },
  {
    method: "POST",
    path: "/hides/email",
    access: "user",
    requiresSetup: true,
    summary:
      "Hide one person by school email.",
  },
  {
    method: "DELETE",
    path: "/hides/[userId]",
    access: "user",
    requiresSetup: true,
    samplePath: "/hides/sample-user-id",
    summary:
      "Unhide a person.",
  },
  {
    method: "GET",
    path: "/privacy",
    access: "user-or-restricted",
    summary:
      "Which consents are in force and which can be withdrawn, and your own request history. Open to a restricted account and before account setup is finished.",
  },
  {
    method: "GET",
    path: "/privacy/export",
    access: "user-or-restricted",
    summary:
      "Download my data: only your own data, and a completed access request on record. Open to a restricted account.",
  },
  {
    method: "POST",
    path: "/privacy/consents/withdraw",
    access: "user-or-restricted",
    summary:
      "Withdraw an optional consent at any time. Withdrawing the sensitive \"who I'd like to meet\" consent also deletes that stored field at once.",
  },
  {
    method: "POST",
    path: "/privacy/delete",
    access: "user-or-restricted",
    summary:
      "Delete my account, in two phases: the account is flagged and every session signed out now, the personal data is scrubbed 30 days later. Needs { \"confirm\": true }.",
  },
  {
    method: "GET",
    path: "/push",
    access: "user",
    requiresSetup: true,
    summary:
      "Whether push notifications are switched on for your phones.",
  },
  {
    method: "PUT",
    path: "/push/device",
    access: "user",
    requiresSetup: true,
    summary:
      "Save this phone's Expo push token (switch push on).",
  },
  {
    method: "DELETE",
    path: "/push/device",
    access: "user",
    requiresSetup: true,
    summary:
      "Forget this phone's push token (switch push off). Only ever removes your own.",
  },
  {
    method: "GET",
    path: "/preferences/matching",
    access: "user",
    requiresSetup: true,
    summary:
      "Your three \"what matters to me\" sliders (classes, interests, free time) and the range they accept.",
  },
  {
    method: "PUT",
    path: "/preferences/matching",
    access: "user",
    requiresSetup: true,
    summary:
      "Save the sliders (0.5 to 1.5 in steps of 0.25). They apply from the next daily batch.",
  },
];
