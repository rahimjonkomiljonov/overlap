|||| ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. ||||| ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. ||||| ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. ||||| ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |# Mobile test matrix

Every function of the store apps (BUILD_PLAN §10), with the five proofs a function needs before it counts as **tested**.
Tick a box only when the proof exists. For the manual columns write the date, device and who ran it in the Notes column.

**Proofs:** **API** = contract test (authorization, validation, every error code) · **UI** = component test · **Maestro** = automated flow on the Android emulator in CI · **Android** = run by hand on a real Android phone · **iPhone** = run by hand on a real iPhone.

**Web only (not in the apps, tested by the existing web suite):** waitlist, admin and moderation consoles, legal pages, ambassador page, creating events.

| ID | Function | Step | API | UI | Maestro | Android | iPhone | Notes |
|---|---|---|---|---|---|---|---|---|
| F01 | Sign in with email code (school address only) | M02 | ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F02 | Personal mail address is refused | M02 | ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F03 | Sign out and session expiry | M02 | ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F04 | Force-upgrade gate (minimum app version) | M02 | ☑ | ☐ | ☐ | ☐ | ☐ | API tests and the 12-check script; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F05 | Terms and Privacy consent (sensitive consent optional) | M04 | ☑ | ☐ | ☐ | ☐ | ☐ | API and shared-service unit tests; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F06 | Age declaration 19+ | M04 | ☑ | ☐ | ☐ | ☐ | ☐ | API and shared-service unit tests; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F07 | Invite code (when cohort release is on) | M04 | ☑ | ☐ | ☐ | ☐ | ☐ | API and shared-service unit tests; checked by hand on the Android 16 emulator 2026-10-24. UI tests, Maestro, real Android phone and iPhone still to do. |
| F08 | Profile wizard: basics and intents | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved against the real local database (34 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F09 | Course and club pickers | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved against the real local database (34 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F10 | Interests, prompts, values quiz | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved against the real local database (34 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F11 | Free-time slots | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved against the real local database (34 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F12 | Photo upload and delete (camera and library). The website has no reorder, so there is none here | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved with real image files against the local database and storage (29 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F13 | Selfie verification | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved with real image files against the local database and storage (29 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F14 | Profile preview and edit | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved against the real local database (34 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F15 | "Who I'd like to meet" (sensitive, consent-gated, never leaks) | M05 | ☑ | ☐ | ☐ | ☐ | ☐ | Server rules proved against the real local database (34 checks) and by unit tests. App screens built and run end to end on the Android 16 emulator 2026-10-24 (44 scripted checks, local database and storage). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F16 | Daily picks (six, with reasons) | M06 | ☑ | ☐ | ☐ | ☐ | ☐ | Server: 28 real-database checks plus unit tests. App run end to end on the Android 16 emulator 2026-10-24 (20 scripted checks). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F17 | Pick detail | M06 | ☑ | ☐ | ☐ | ☐ | ☐ | No separate route: the list card holds everything the detail shows. Server: 28 real-database checks plus unit tests. App run end to end on the Android 16 emulator 2026-10-24 (20 scripted checks). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F18 | Pass | M06 | ☑ | ☐ | ☐ | ☐ | ☐ | Server: 28 real-database checks plus unit tests. App run end to end on the Android 16 emulator 2026-10-24 (20 scripted checks). UI tests, Maestro in CI, real Android phone and iPhone still to do. |
| F19 | "How your picks are chosen" | M06 | ☐ | ☐ | ☐ | ☐ | ☐ | Opens the website page in the browser, so there is no API to prove. Checked on the Android 16 emulator 2026-10-24 (opens, Back returns). UI test, Android phone and iPhone still to do. |
| F20 | Cohort-closed state | M06 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F21 | Wave with a note | M08 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F22 | Waved-at-you inbox | M08 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F23 | Wave back | M08 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F24 | Decline a wave | M08 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F25 | Daily wave cap and rate-limit messages | M08 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F26 | Matches list | M09 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F27 | Chat send and receive (two devices) | M09 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F28 | Icebreakers | M09 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F29 | Unmatch | M09 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F30 | Meetup proposal | M10 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F31 | Accept, decline, reschedule | M10 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F32 | Public spots and both-free times | M10 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F33 | Plan share link | M10 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F34 | Emergency card and numbers | M10 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F35 | Report a person or message | M12 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F36 | Block | M12 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F37 | Hide-from rules | M12 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F38 | Safety settings, restrictions and appeals | M12 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F39 | Data export | M13 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F40 | Consent withdrawal | M13 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F41 | Account deletion with 30-day grace (in the app) | M13 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F42 | Notification preferences | M13 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F43 | Pick preferences | M13 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F44 | Push permission and device registration | M14 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F45 | Push delivery (match, wave, unread message), generic text only | M14 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F46 | Quiet hours (21:00 to 08:00 Seoul time, queued not dropped) | M14 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F47 | Korean and English parity, language switch | M15 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F48 | Deep links and native share | M15 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F49 | Offline, loading, empty and error states | M15 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F50 | Accessibility: TalkBack, VoiceOver, text scaling, 44 pt targets | M15 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F51 | Campus Pockets visibility switch (opt-in, off by default) | M07 | ☑ | ☐ | ☐ | ☐ | ☐ | Server: unit tests on the mobile handler (`PUT /pockets/visibility`) and the contract test. App screen built (`mobile/pockets.tsx`), typechecks; not yet run on the emulator (blocked this session by the e2e/local-database issue below, not by the app code). |
| F52 | Pockets list by course and club, with member counts | M07 | ☑ | ☐ | ☐ | ☐ | ☐ | Server: reuses the website's `getMyPockets` (already proven by `e2e/pockets.spec.ts`) behind a new `GET /pockets` mobile route; unit tests on the handler and the contract test. App screen built, typechecks; not yet run on the emulator. |
| F53 | Pocket people filtered by the shared thing (opted-in people only) | M07 | ☑ | ☐ | ☐ | ☐ | ☐ | Server: reuses the website's `getPocket`/`isPocketMember` (already proven by `e2e/pockets.spec.ts`) behind a new `GET /pockets/[kind]/[pocketId]` mobile route; unit tests confirm a member row carries no field beyond what the app shows. App screen built, typechecks; not yet run on the emulator. |
| F54 | Wave from a pocket | M07 | ☑ | ☐ | ☐ | ☐ | ☐ | New shared `waveFromPocketStep` (`src/server/pockets/service.ts`) used by both the website's `waveFromPocket` action and the new idempotent `POST /pockets/wave` mobile route — 7 unit tests cover the cap, block, mutual-match and not-a-member cases directly. App screen built (optimistic wave button), typechecks; not yet run on the emulator. **This is the first mobile route that sends a wave: per M08's note, applying the `idempotency_keys` migration to the production database needs the owner's go-ahead before this route is used for real — not done yet, on purpose.** |
| F55 | Events list and event detail | M11 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F56 | RSVP and the opt-in "show me in who's going" | M11 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F57 | Who's going, ranked by overlap (opted-in guests only) | M11 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F58 | 48-hour connect window and mutual connect that makes a match | M11 | ☐ | ☐ | ☐ | ☐ | ☐ | |

## Device matrix (fill in as devices are found, BUILD_PLAN gate G5)

| Device | OS version | Owner | Used for |
|---|---|---|---|
| Android phone 1 (recent) | | | |
| Android phone 2 (older or low-end) | | | |
| iPhone 1 (small screen) | | | |
| iPhone 2 (large screen) | | | |

## Release sign-off

- [ ] Every row above is green, or has a written exception accepted by the owner.
- [ ] Google closed test ran 14 days with 12 or more testers.
- [ ] TestFlight beta ran with real students and its bugs are closed.
- [ ] `/security-review` has no open high finding.
- [ ] Store listings checked by the Korean reader.
