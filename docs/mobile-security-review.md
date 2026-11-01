# Mobile security and privacy review (M17)

Reviewed 2026-11-01 by Claude (not an outside auditor). Scope: the mobile API (`src/app/api/mobile/v1/*`, `src/server/mobile/*`), the Expo app (`mobile/`), the app bundle, the dependency tree and the privacy paperwork. Method: read the code, trace every object-id route to its service, scan the repository and a store-style bundle for secrets, run `npm audit`, then fix and re-test. **Result: no high or critical finding is open.**

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | `next` 16.3.8 had two unauthenticated remote-code-execution advisories (image optimizer with SVG, `use cache` with typed arrays) and a Server Actions denial of service (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r). | **Fixed**: `next` and `eslint-config-next` 16.4.3. Website builds. |
| 2 | Critical | `better-auth` 1.7.5 (website and app): OAuth state usable as a magic link to sign in as another user, and an OAuth-proxy sign-in bypass (GHSA-965c-763c-88jm, GHSA-r4xp-prcw-77qf). We sign in with emailed codes and use no OAuth provider, so we were probably not reachable, but the library had to be patched. | **Fixed**: `better-auth` 1.7.15 on the website, and `better-auth` + `@better-auth/expo` 1.7.15 (exact pins) in the app. |
| 3 | High | `zod` 4.6.5 can exhaust memory validating oversized collections (our request validation uses it). `sharp` < 0.35.5 (librsvg CVE), `undici` < 7.30.1 (several TLS and redirect issues), `prisma` < 7.10.1. | **Fixed**: `zod` 4.6.7, `sharp` 0.35.5, `undici` 7.30.1, `prisma` 7.10.1. |
| 4 | Medium (hardening) | The Android app allowed cloud backup (`allowBackup`). The secure-store tokens were already excluded by Expo's backup rules, but a dating app should not put any app data in a cloud backup. | **Fixed**: `android.allowBackup: false` in `mobile/app.json`; guarded by `src/server/mobile/app-config.test.ts`. |
| 5 | Low | `PUT /profile/finish` and `DELETE /profile/photos/{id}` have no rate limit of their own. Both are bounded by the profile's own rules (finishing is idempotent; photo removal stops at the 3-photo minimum), and the 120/hour profile limit covers the steps around them. | Open, accepted. |
| 6 | Low | Upload size is checked from `Content-Length` before reading; a request without that header is only measured after the body is read. The hosting platform refuses bodies over 4.5 MB before our code runs, and the app shrinks every picture to well under 1 MB first. | Open, accepted. |
| 7 | Info | Remaining `npm audit` highs are in tooling that does not run on the server or in the app's own code paths: the `shadcn` CLI and its chain (`@modelcontextprotocol/sdk`, `body-parser`, `systeminformation`), `vite` and `source-map-js` (through vitest), and Expo's build tools (`@expo/cli`, `expo-router`'s `query-string`/`decode-uri-component`, `node-forge`). The audit's own suggested fix for the Expo ones is a downgrade to Expo 51, which we do not take. Re-check when Expo publishes its next SDK patch. | Open, accepted. |

## What was checked and found sound

- **Authorization.** All 66 mobile route files go through `mobileRoute` (version check, signed-in, account status, account setup) except `GET /health`, which is public by design and returns nothing about any user. The 22 object-id routes were each traced to their service: chat (conversation membership, and "not a participant" looks like "does not exist"), unmatch, wave decline, wave from a pick (the batch must be the caller's), meetup respond and share link (caller must be one of the match's two people), photo removal (photo must belong to the caller's profile). Someone else's object answers 404, never 403.
- **Sensitive data.** `interestedIn` is named by no mobile route or helper (`sensitive.test.ts`). Push payloads carry only generic text and a screen path.
- **Tokens and storage.** The session cookie and the push token are kept in `expo-secure-store` (Android Keystore / iOS Keychain). The app writes nothing to `console`. No token is placed in a URL.
- **TLS.** The app's default address is `https://overlaps.tech`. Plain http is allowed only by the test build switch (`OVERLAP_TEST_BUILD=1`), and `app-config.test.ts` fails if a store build would allow it. iOS keeps App Transport Security at its default.
- **Secrets.** `git grep` over tracked files and the history search for key prefixes found nothing; no `.env*` file other than `.env.example` is tracked; no keystore, service-account or `google-services` file is tracked. A store-style bundle (`expo export`, no test address) was scanned: no key, no server variable value, no `postgres://`, no `http://` address except the library's own `localhost:8081` auth-proxy string, and the only site address is `https://overlaps.tech`.
- **Pictures.** The app re-saves every photo and selfie as a smaller JPEG, which drops the location data before upload; the server re-encodes them again.
- **Abuse limits.** Every other write route has its own rate limit; sends also need an `Idempotency-Key`.

## Not done by this review (needs a person)

- A second pair of eyes: this was a review by the same assistant that wrote much of the code. An outside penetration test is a launch-gate decision for the owner (BUILD_PLAN O-items), not something this step claims to replace.
- Real-device checks of Keychain behaviour on an iPhone (no iPhone is available yet).
- The privacy policy and the processor list were already updated at M14 (Expo push service, Apple APNs, Google FCM; `src/server/legal/data-flow.test.ts` passes). Nothing in this review adds a processor. The lawyer review (O6) still applies.
