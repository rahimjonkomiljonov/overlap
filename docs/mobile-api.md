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
{ "userId": "…", "email": "kim@gachon.ac.kr", "name": "Kim", "role": "USER", "status": "ACTIVE", "accountSetupComplete": false }
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

## Adding a route

1. Create `src/app/api/mobile/v1/<path>/route.ts` and export the handler from `mobileRoute("<name>", handler, { idempotent?, allowRestricted? })`.
2. Validate input with `readJson` / `readQuery` and a strict zod schema; build lists with `pageOf`; add `enforceRateLimit` where a person could hammer it.
3. Add it to `src/server/mobile/routes.ts`, add its loader in `contract.test.ts`, document it here, and add its row to `docs/mobile-test-matrix.md`.
