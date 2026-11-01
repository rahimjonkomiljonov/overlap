# Store privacy forms: draft answers (M17)

**DRAFT, written 2026-11-01 from what the app and server actually store (`prisma/schema.prisma`, `docs/data-flow.md`). The owner submits these, and the lawyer review (O6) should read them before submission.** Both stores check the answers against the privacy policy, so any change to the policy or to `docs/data-flow.md` means re-checking this file.

Facts the answers rest on: no advertising, no analytics SDK, no tracking across other companies' apps or sites; no location (meetups use named Safe Spots, never GPS); the app reaches only our own website (`https://overlaps.tech`) and, for notifications, Expo's push service; data is encrypted in transit (https) and the sensitive field `interestedIn` is also encrypted at rest; people can delete their account inside the app (30-day grace, then the personal details are erased).

## Google Play, Data safety

**Does the app collect or share required data types?** Collects: yes. Shares with third parties: no, except the service providers below, which Google does not count as "sharing" when they only process data for us (Supabase hosting, Vercel hosting, Expo/FCM push delivery).

| Google category | Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|---|
| Personal info | Name (first name) | Yes | No | App functionality | No |
| Personal info | Email address | Yes | No | Account management, app functionality | No |
| Personal info | User IDs | Yes | No | Account management | No |
| Personal info | Sexual orientation ("who I'd like to meet") | Yes | No | App functionality (matching) | **Yes**: only with the separate sensitive consent, can be withdrawn |
| Personal info | Other info (gender, pronouns, birth year, year, major, courses, clubs, interests, values answers, free-time grid) | Yes | No | App functionality, personalization | Mostly required for matching |
| Photos and videos | Photos | Yes | No | App functionality (profile photos; verification selfie, kept at most 7 days) | Profile photos required |
| Messages | Other in-app messages | Yes | No | App functionality (chat) | No |
| App activity | Other user-generated content (prompt answers, wave notes, reports) | Yes | No | App functionality, safety | Partly |
| App info and performance | Crash logs, diagnostics | **No** (no crash SDK; server errors are scrubbed and stay on our server) | n/a | n/a | n/a |
| Device or other IDs | Device push token | Yes | No (Expo and FCM only relay it) | App functionality (notifications) | **Yes**: permission asked only on tap |
| Location | Approximate or precise | **No** | n/a | n/a | n/a |
| Contacts, calendar, files, health, financial, web browsing, audio | **No** | n/a | n/a | n/a | n/a |

**Security practices:** data encrypted in transit: **yes**. Users can request deletion: **yes**, in the app (Me, Privacy and account, Delete my account). Google also requires a **web link** where deletion can be requested without installing the app: the privacy page and the contact page describe it, but a dedicated public deletion-request page does not exist yet (gap, see below). Independent security review: **no** (do not tick it).

**Data retention to state:** account data for the life of the account plus 30 days after a deletion request; verification selfies at most 7 days; report evidence per the retention rules in `docs/REQUIREMENTS.md` §15.4.

**Target audience and content:** 18+ only (the app is for 19+ campus users). Not designed for children. Content rating questionnaire: user-generated content (chat, photos) with reporting, blocking and moderation tools; dating; no violence or gambling.

## Apple App Store, App privacy ("nutrition label") and review answers

**Tracking:** none. Do not tick "Used to track you" for any type. No App Tracking Transparency prompt is needed, and none is shown.

| Apple data type | Collected | Linked to identity | Used for |
|---|---|---|---|
| Contact info: Email address | Yes | Yes | App functionality |
| Contact info: Name | Yes | Yes | App functionality |
| Sensitive info (sexual orientation) | Yes (optional, separate consent) | Yes | App functionality |
| User content: Photos | Yes | Yes | App functionality |
| User content: Other user content (messages, prompt answers, notes) | Yes | Yes | App functionality |
| Identifiers: User ID | Yes | Yes | App functionality |
| Identifiers: Device ID (push token) | Yes | Yes | App functionality |
| Other data (gender, birth year, courses, clubs, interests, free time) | Yes | Yes | App functionality, personalization |
| Location, Contacts, Browsing history, Search history, Purchases, Health, Usage data, Diagnostics | **No** | n/a | n/a |

**App Review notes to prepare (guideline 4.2 and 1.2):** the app is more than a website wrapper: native tabs, haptics, push, the phone's photo picker and camera, deep links, share sheet, offline state. For user-generated content (1.2) point to: report and block in every profile and chat, a published moderation playbook, 24-hour handling target, account deletion in the app, and a way to contact support (Contact page). A **reviewer account** (G6) is still needed: it must be a campus-email account that can be signed in without access to a school mailbox, which the real sign-in does not allow. That needs an owner decision (a fixed reviewer code or a demo cohort); not created here.

## Gaps that need the owner

1. A public page where anyone can request deletion without the app (Google requires a web link).
2. The reviewer account for Apple and Google (G6).
3. Lawyer read-through of both forms (O6) before submitting, since "sexual orientation" is a sensitive-information answer under PIPA and under both stores' rules.
4. If Sentry or PostHog are ever turned on, both forms change ("crash logs", "usage data") and so must the privacy policy and `docs/data-flow.md`.
