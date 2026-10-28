# Mobile API (v1)

The backend the store apps talk to (BUILD_PLAN §10). Everything lives under `/api/mobile/v1`, plus Better Auth's own `/api/auth/*` for sign-in. The route list is `src/server/mobile/routes.ts`; a test fails if this document, that list and the route files disagree.

## Conventions

**Every request**
- `X-App-Version: 0.1.0` — the app's own version. An app older than the server's minimum gets `426 UPGRADE_REQUIRED` from every protected route, and `/health` says `supported: false`. A missing header counts as too old.
- The session cookie, taken from the Better Auth client and sent by hand (the phone has no cookie jar). Never put it in a URL.
- Sends (anything marked **idempotent** below) also need `Idempotency-Key: <random UUID>`; see Idempotency.
- JSON bodies need `Content-Type: application/json` and stay under 64 KB. Photos and selfies get their own upload routes.

**Every response**
- JSON, `Cache-Control: no-store`, and `X-Api-Version: 1`.
- Success is the data itself. Failure is `{ "error": "<CODE>" }`, plus `fields` for `INVALID_INPUT` or `reason` for `RULE_VIOLATION`.

**Errors**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_INPUT` | The request is malformed. `fields` lists `{ name, problem }`, the field and the kind of problem, never the value sent. |
| 401 | `UNAUTHENTICATED` | No session, an expired or revoked one, or a deleted account. The app signs out and shows sign-in. |
| 403 | `ACCOUNT_RESTRICTED` | The account is paused, suspended or banned and may not do this. |
| 403 | `FORBIDDEN` | The role is not allowed. |
| 403 | `ACCOUNT_SETUP_REQUIRED` | The account has not finished account setup (no campus yet). Send the person to the setup screens. |
| 404 | `NOT_FOUND` | It does not exist, or it is not yours to see. |
| 409 | `REQUEST_IN_PROGRESS` | The same `Idempotency-Key` is still being processed. Retry in a moment. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | The same key was used with a different body or on a different route. A bug in the app. |
| 422 | `RULE_VIOLATION` | The request was well-formed but broke a rule. `reason` is a stable code (for example `TOO_YOUNG`, `INVALID_INVITE`). |
| 426 | `UPGRADE_REQUIRED` | The app is too old. Show the update screen. |
| 429 | `RATE_LIMITED` | Too many requests. Wait and try again. |
| 500 | `INTERNAL` | Something broke on our side. Nothing is leaked; it is logged. |

The server never returns text meant for people. The app writes its own messages (Korean and English) for each code.

**Order of checks on a protected route:** app version, then signed in, then account status, then (for sends) the idempotency key, then the route's own rules.

**Lists** take `?limit=` (1 to 50, default 20) and `?cursor=` and return `{ "items": [...], "nextCursor": "..." | null }`. A cursor is opaque: pass back exactly what was returned. A cursor that does not decode is `INVALID_INPUT`.

**Idempotency.** A phone on a bad connection cannot tell whether a wave or a message got through, so it resends. Put a fresh `Idempotency-Key` (8 to 64 characters of letters, digits, `_`, `-`; a UUID is right) on every send and repeat the same key on a retry. The first answer is returned again with `Idempotent-Replay: true` and nothing is sent twice. Client errors (400s) are remembered the same way; server errors and `429` are not, so a retry runs for real. Keys are forgotten after 24 hours. The replayed body has the same content as the first answer, but its object keys may come back in a different order (the database sorts them), so never depend on key order.

**Rate limits** are per signed-in person and sit on top of business rules such as the daily wave cap.

**Changing the API.** Additive changes (a new field, a new route) stay in v1. A breaking change gets `/api/mobile/v2`, and v1 keeps working until `MIN_APP_VERSION` is raised past every app that needs it.

## Routes

### `GET /api/mobile/v1/health`
Public. Is the server up, which API version, the oldest app version it accepts, and whether the calling app is new enough.
```json
{ "status": "ok", "apiVersion": 1, "minAppVersion": "0.1.0", "supported": true }
```
It does not touch the database and returns nothing about any user.

### `GET /api/mobile/v1/me`
Signed in. A paused, suspended or banned account may call it, so the app can explain the situation; a deleted account may not. Only the caller's own row.
```json
{ "userId": "…", "email": "kim@gachon.ac.kr", "name": "Kim", "role": "USER", "status": "ACTIVE", "accountSetupComplete": false, "profileComplete": false }
```

### `GET /api/mobile/v1/onboarding`
Signed in. What the app needs to draw the account-setup screens.
```json
{ "accountSetupComplete": false, "inviteCodeRequired": false, "minimumAge": 19 }
```
`inviteCodeRequired` is true while cohort release is on.

### `POST /api/mobile/v1/onboarding/account`
Signed in. Finishes account setup with the same rules as the website (they call one shared function): the age check, the Terms and Privacy consent, the optional sensitive consent and, when required, the invite code.
```json
{ "birthYear": 2000, "birthMonth": 5, "birthDay": 17, "attestedAdult": true, "termsAccepted": true, "sensitivePreference": false, "inviteCode": "ABCD1234" }
```
- `attestedAdult` and `termsAccepted` must be `true`: the app shows them as explicit ticks, never pre-ticked.
- `sensitivePreference` is a required yes or no for the separate "who I'd like to meet" consent. **No is a normal answer**: the account is still set up, only Dating mode stays off.
- The birth month and day are used for the age check only. They are never stored or logged; only the birth year is kept.
- `inviteCode` is required only when `inviteCodeRequired` is true.
- Success: `{ "status": "complete", "datingAvailable": false }`. Calling it again after setup is finished changes nothing and returns `{ "status": "complete", "alreadyComplete": true }`.
- A rule that was broken (well-formed request, wrong answer): `422 RULE_VIOLATION` with `reason` one of `TOO_YOUNG`, `INVALID_DATE`, `IMPLAUSIBLE_YEAR`, `INVALID_INVITE`, `INVALID_DOMAIN`. A bad invite code changes nothing.
- Limited to 10 attempts per 15 minutes per person.

### Profile (all need finished account setup)

Every route below needs a signed-in, active account that has **finished account setup**; without it they answer `403 ACCOUNT_SETUP_REQUIRED`. They use the website's own rules and limits (one shared code), and are limited to 120 saves an hour per person. Bodies are strict: a field that is not listed is refused.

#### `GET /api/mobile/v1/profile`
The person's own profile and wizard state: `onboardingStep` (furthest step reached, to resume), `completedAt`, `strength`, every answer, `photos`, `missing` (required pieces still missing: `basics`, `intents`, `valuesQuiz`, `prompts`, `photos`) and `datingStatus` (`available`, `needs_consent` or `cohort_closed`). It includes the person's own "who I'd like to meet", which is theirs to see and edit; it is never returned for anyone else.

#### `GET /api/mobile/v1/profile/options`
The lists and limits the screens are built from, so the app never hard-codes a rule: `limits`, `genders`, `studyYears`, `majorGroups`, `valuesQuiz`, `prompts`, `interests`.

#### `GET /api/mobile/v1/reference/search`
Search for the pickers (up to 20 results), with `?type=course|club|spot|interest&q=...`. Courses, clubs and spots are always the caller's **own campus**. `term` (optional) picks the course term; the default is the current one. Limited to 300 searches per 10 minutes.

#### Saving a step
Saving replaces that step's answers, so repeating a save is harmless. Success is `{ "status": "saved" }`. A rule the step enforces is `422 RULE_VIOLATION` with a `reason`.

| Route | Body | Reasons it can refuse |
|---|---|---|
| `PUT /api/mobile/v1/profile/basics` | `firstName`, `gender`, `pronouns?`, `year`, `major`, `interestedIn[]` | none. `interestedIn` is stored only if the sensitive consent was granted, otherwise it is ignored |
| `PUT /api/mobile/v1/profile/intents` | `intents[]` (`FRIENDS`, `STUDY`, `DATING`, `OPEN`) | `DATING_REQUIRES_CONSENT`, `DATING_NOT_OPEN` |
| `PUT /api/mobile/v1/profile/courses` | `courseIds[]` | none. Ids that are not on your campus are dropped |
| `PUT /api/mobile/v1/profile/clubs` | `clubIds[]` | none. Same |
| `PUT /api/mobile/v1/profile/spots` | `spotIds[]` | none. Same |
| `PUT /api/mobile/v1/profile/free-time` | `slots[]` (0 to 83) | none |
| `PUT /api/mobile/v1/profile/interests` | `interestTagIds[]`, `freeText[]` | `TOO_MANY_INTERESTS`, `SENSITIVE_CONTENT` |
| `PUT /api/mobile/v1/profile/prompts` | `promptIds[]`, `answers[]` (exactly 3 each) | `DUPLICATE_PROMPT`, `INVALID_PROMPT` |
| `PUT /api/mobile/v1/profile/values` | `answers[]` (8 numbers, 1 to 5) | none |

#### `POST /api/mobile/v1/profile/finish`
Marks the profile finished once every required piece is there. Returns `{ "status": "complete" }` or `{ "status": "incomplete", "missing": [...] }`.

### Photos and selfie (need finished account setup)

Uploads are `multipart/form-data` with one file field. (From Expo, append an `expo-file-system` `File`: Expo's `fetch` cannot send `{ uri, name, type }`.) **A file may be at most 4 MB**, a limit lower than the 4.5 MB request cap Vercel enforces before our code runs, so you get our clear `FILE_TOO_LARGE` and not a platform error. The app therefore shrinks every photo on the phone first (a 1600 pixel JPEG is well under 1 MB). The declared file type is only what the sender claims: the server decodes the bytes, and anything that is not a picture is `INVALID_FILE_TYPE`. Every stored photo is re-encoded, so EXIF data (GPS, device, timestamps) never reaches storage.

An upload is not given an idempotency key: if a retry does add the photo twice, delete the extra one.

Refusals are `422 RULE_VIOLATION` with a `reason`: `FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `TOO_MANY_PHOTOS` (the limit is six), `ALREADY_PENDING` (selfie), `MIN_PHOTOS` (delete). A missing file or wrong content type is `400 INVALID_INPUT`.

#### `POST /api/mobile/v1/profile/photos`
Field `photo`. Success is `201 { "photo": { "id": "…", "url": "https://…" } }`. Limited to 20 uploads an hour. Photos also appear in `GET /profile` with full web addresses the phone can load (signed and short-lived with real storage, so read the profile again when one expires). In local development the address is our own `/api/dev-storage/…` route on the host the phone used; it needs the session cookie, which React Native's `Image` does not send on Android (use `expo-image`).

#### `DELETE /api/mobile/v1/profile/photos/[photoId]`
Removes one of your own photos: `{ "status": "deleted", "photoId": "…" }`. Someone else's photo is `404 NOT_FOUND`, exactly like one that does not exist. Once the profile is finished it must keep at least three photos (`MIN_PHOTOS`).

#### `POST /api/mobile/v1/verification/selfie`
Field `selfie`. Success is `201 { "status": "submitted" }`. One selfie waits for review at a time. Limited to 10 an hour. A selfie is private to you and the moderator who reviews it; there is no route that returns it.

#### `GET /api/mobile/v1/verification`
`{ "state": "unsubmitted" | "pending" | "verified" }` or `{ "state": "rejected", "reason": "…" | null }`.

### Daily picks (need finished account setup and a finished profile)

#### `GET /api/mobile/v1/picks`
Today's picks for every mode the person opted into, the same batch and rules as the website's `/picks` (the first call of the day composes it). Query: `?locale=en|ko` (default `en`), the language of the reason labels and prompt questions; the app writes its own words. Limited to 120 calls an hour. A profile that is not finished is `422 RULE_VIOLATION` with `reason: PROFILE_INCOMPLETE`.
```json
{ "intents": [ { "intent": "FRIENDS", "items": [ {
  "id": "…", "firstName": "Mina", "year": 2, "major": "…",
  "photos": [ { "id": "…", "url": "https://…" } ],
  "prompts": [ { "id": "…", "question": "My perfect day looks like", "answer": "…" } ],
  "reasons": [ { "type": "course", "label": "…" }, { "type": "club", "label": "…" }, { "type": "interest", "label": "…" }, { "type": "freeTime", "day": 2, "block": 8 }, { "type": "values" } ],
  "secondChance": false } ] } ] }
```
Only undecided picks are listed, best first, so an intent with an empty `items` is the "you're caught up" state, and no `intents` at all means no mode is chosen. `id` is the pick's own id: it is what the app sends to act on a card, and it means something only to its owner. A card has no field for the other person's user id, email, birth year, gender or who they would like to meet. (A photo address contains the photo's storage folder, which is the owner's id, exactly as the website's photo links do.) `reasons` use the website's own encoding: `freeTime.day` is 0 (Monday) to 6, `block` is a two-hour block 0 (12 to 2 am) to 11. Photo addresses are full addresses, signed and short-lived with real storage. There is no separate detail route: a card holds everything the detail screen shows.

#### `POST /api/mobile/v1/picks/[batchItemId]/pass`
Idempotent (needs an `Idempotency-Key`). Passes on one of your own picks: `{ "status": "passed", "batchItemId": "…" }`. Someone else's pick, or one that does not exist, is `404 NOT_FOUND`; a pick already decided (passed or waved) is `422 RULE_VIOLATION` with `reason: ALREADY_DECIDED`. Limited to 200 passes an hour. A passed person is not listed again, and after a second pass they are not offered again at all.

#### `POST /api/mobile/v1/picks/[batchItemId]/wave`
Idempotent (needs an `Idempotency-Key`). Body: `{ "note"?: "…" }`. Waves at one of your own undecided picks: `{ "status": "sent", "batchItemId": "…", "matched": false }`. The app only ever sends a plain profile-level wave (no per-photo/per-prompt targeting yet, unlike the website's richer composer). Someone else's pick, or one that does not exist, is `404 NOT_FOUND`; a pick already decided is `422 RULE_VIOLATION` with `reason: ALREADY_DECIDED`; a blocked pair is `reason: BLOCKED`; the 8/day cap is `reason: DAILY_CAP_REACHED`. Limited to 200 a hour. If the other person already waved at you first, this call forms a match immediately (`matched: true`) via the same `formMatch` both directions share.

### Waves (need finished account setup)

#### `GET /api/mobile/v1/waves`
Pending waves sent to you, most recent first — same data as the website's "Waved at you" inbox.
```json
{ "waves": [ { "id": "…", "fromUserId": "…", "firstName": "Mina", "photoUrl": "https://…",
  "note": "Same section! See you Monday.", "targetElement": { "type": "profile" }, "createdAt": "2026-…" } ] }
```
Excludes anyone you have blocked or been blocked by. Limited to 120 calls an hour.

#### `POST /api/mobile/v1/waves/[waveId]/wave-back`
Idempotent (needs an `Idempotency-Key`). Body: `{ "note"?: "…" }`. Waves back at whoever sent this wave: `{ "status": "matched" }` — since the incoming wave is already `PENDING`, this always completes the pair into a match. Someone else's wave, or one that does not exist, is `404 NOT_FOUND`; one already decided is `422 RULE_VIOLATION` with `reason: ALREADY_DECIDED`; a blocked pair is `reason: BLOCKED`; the 8/day cap is `reason: DAILY_CAP_REACHED`. Limited to 200 an hour.

#### `POST /api/mobile/v1/waves/[waveId]/decline`
Dismisses an incoming wave without waving back: `{ "status": "declined" }`. No cost against either side's cap. Someone else's wave, or one that does not exist, is `404 NOT_FOUND`; one already decided is `422 RULE_VIOLATION` with `reason: ALREADY_DECIDED`. Limited to 200 an hour.

### Campus Pockets (need finished account setup)

#### `GET /api/mobile/v1/pockets`
Your own course and club pockets, same data as the website's `/pockets`. Query: `?locale=en|ko` (default `en`), the language of each pocket's label.
```json
{ "verified": true, "visible": false, "hasPocketIntent": true,
  "pockets": [ { "kind": "course", "id": "…", "label": "CS201 · Data Structures", "memberCount": 4 } ] }
```
`visible` is the person's own Pockets opt-in (off by default); `verified` and `hasPocketIntent` are the other two things that gate browsing (REQUIREMENTS.md C7). None of the three being false is an error: the app shows the matching empty state instead.

#### `PUT /api/mobile/v1/pockets/visibility`
Body: `{ "visible": true }`. Turns Campus Pockets on or off for the caller; answers back `{ "visible": true }`.

#### `GET /api/mobile/v1/pockets/[kind]/[pocketId]`
`kind` is `course` or `club`. One pocket in full, same data and rules as the website's `/pockets/{kind}/{pocketId}`. Query: `?locale=en|ko` (default `en`).
```json
{ "verified": true, "visible": true, "hasPocketIntent": true, "label": "CS201 · Data Structures",
  "members": [ { "userId": "…", "firstName": "Mina", "year": 2, "photoUrl": "https://…",
    "intents": ["FRIENDS", "STUDY"], "alsoShared": 1, "waved": false, "matched": false } ] }
```
A pocket that is not the caller's own course or club, or on another campus, is `404 NOT_FOUND`. `members` is join order, not ranked (Pockets is the non-algorithmic route); it is empty whenever `verified`/`visible`/`hasPocketIntent` is false, since that is the same browsing gate as the list route.

#### `POST /api/mobile/v1/pockets/wave`
Idempotent (needs an `Idempotency-Key`). Body: `{ "kind": "course", "pocketId": "…", "toUserId": "…", "note"?: "…" }`. Waves at someone the caller can currently see in that pocket: `{ "status": "sent", "matched": false }`. Same 8/day cap, rate limit, block check and mutual-match rule as a wave from Daily Picks (`src/server/pockets/service.ts`'s `waveFromPocketStep`, shared with the website's `waveFromPocket` action); the target is re-checked as a current pocket member here, not trusted from the app. Someone not currently visible to the caller in that pocket is `404 NOT_FOUND`; a blocked pair is `422 RULE_VIOLATION` with `reason: BLOCKED`; the cap is `422 RULE_VIOLATION` with `reason: DAILY_CAP_REACHED`. Waving someone already waved is a no-op success, not an error.

### Matches and chat (need finished account setup)

#### `GET /api/mobile/v1/matches`
Every active match, most recent first — same data as the website's `/matches`, the chat entry point. Limited to 60 calls an hour.
```json
{ "matches": [ { "matchId": "…", "conversationId": "…", "otherUserId": "…", "firstName": "Mina", "photoUrl": "https://…", "matchedAt": "2026-…" } ] }
```
Excludes anyone you have blocked or been blocked by (same as the website). `conversationId` is never null in practice (every match gets its conversation the moment it forms).

#### `POST /api/mobile/v1/matches/[matchId]/unmatch`
Ends an active match for good, recording who did it: `{ "status": "unmatched" }`. No un-unmatch. A match that is not the caller's, or does not exist, is `404 NOT_FOUND`; one already ended is `422 RULE_VIOLATION` with `reason: ALREADY_DECIDED`. Limited to 30 an hour.

#### `GET /api/mobile/v1/chat/[conversationId]`
The thread itself: same data as the website's chat page. Query: `?locale=en|ko` (default `en`), the language of the icebreaker reason labels; the app writes its own sentences around them. Limited to 120 calls an hour — polled every few seconds while the thread is open, same cadence as the website.
```json
{ "conversationId": "…", "matchId": "…", "status": "ACTIVE", "revivedAt": null, "matchStatus": "ACTIVE",
  "otherUserId": "…", "otherFirstName": "Mina", "otherPhotoUrl": "https://…", "canInteract": true,
  "messages": [ { "id": "…", "senderId": "…", "text": "…", "createdAt": "2026-…" } ],
  "icebreakers": [ { "type": "course", "label": "…" }, { "type": "freeTime", "day": 2, "block": 8 } ] }
```
A conversation that is not the caller's, or does not exist, or whose two participants have blocked each other, is `404 NOT_FOUND` — never distinguished, same as the website's own guard. `icebreakers` uses the same reason encoding as a pick's `reasons` (`src/server/picks/reasons.ts`), and is only ever non-empty while `messages` is still empty, falling back to nothing (the app shows its own generic prompts) when there is no shared-overlap wave to explain. `canInteract` is false once unmatched, or while `status` is `EXPIRED` and not yet revived — the app hides its composer exactly then.

#### `POST /api/mobile/v1/chat/[conversationId]/messages`
Idempotent (needs an `Idempotency-Key`). Body: `{ "text": "…" }` (1 to 2000 characters). Sends a message in an already-matched, still-interactable conversation: `{ "status": "sent", "message": { "id": "…", "senderId": "…", "text": "…", "createdAt": "2026-…" } }`. A conversation that is not the caller's is `404 NOT_FOUND`; one whose match has ended is `422 RULE_VIOLATION` with `reason: UNMATCHED`; one silent 7 days and not revived is `reason: EXPIRED`. Limited to 60 messages per 5 minutes (shared with the website's own chat rate limit).

#### `POST /api/mobile/v1/chat/[conversationId]/revive`
The one-time "start this conversation again" after 7 days of silence: `{ "status": "revived" }`. A conversation that is not the caller's is `404 NOT_FOUND`; one whose match has ended is `422 RULE_VIOLATION` with `reason: UNMATCHED`; one that is not actually expired is `reason: NOT_EXPIRED`; one already revived once is `reason: ALREADY_REVIVED`. Limited to 10 an hour.

## Adding a route

1. Create `src/app/api/mobile/v1/<path>/route.ts` and export the handler from `mobileRoute("<name>", handler, { idempotent?, allowRestricted? })`.
2. Validate input with `readJson` / `readQuery` and a strict zod schema; build lists with `pageOf`; add `enforceRateLimit` where a person could hammer it.
3. Add it to `src/server/mobile/routes.ts`, add its loader in `contract.test.ts`, document it here, and add its row to `docs/mobile-test-matrix.md`.
