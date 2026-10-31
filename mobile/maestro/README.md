# Maestro flows (BUILD_PLAN M16)

Automated flows that drive the real app on an Android emulator with [Maestro](https://maestro.dev) (free, Apache licence).
Each flow starts from a clean install, signs in through the app's own screens, and checks both what the person sees and
what the database says.

| Flow | Matrix functions |
|---|---|
| `01_sign_in` | F01 sign in with a code, F02 a personal address is refused, F03 sign out |
| `02_account_setup` | F05 Terms and Privacy consent (sensitive consent optional), F06 age declaration (a too-young date is refused) |
| `03_profile_wizard` | F08 basics and intents, F09 course and club pickers, F10 interests, prompts and values quiz, F14 preview and finish (photos come from the helper) |
| `04_picks_and_pass` | F16 daily picks with reasons, F17 pick detail, F18 pass |
| `05_wave_with_note` | F21 wave with a note |
| `06_wave_back` | F22 waved-at-you inbox, F23 wave back (makes a match), F26 matches list |
| `07_decline_wave` | F24 decline a wave |
| `08_matches_and_chat` | F26 matches, F28 icebreakers, F27 chat send and receive, F29 unmatch |
| `09_meetup_propose` | F32 suggested times and public Safe Spots, F30 propose a time, F34 emergency card, F33 plan share link |
| `10_meetup_respond` | F31 decline, accept, the private check-in, cancel and reschedule |
| `11_events_rsvp` | F55 events list and detail, F56 RSVP with the opt-in (and a full event), F57 who is going |
| `12_events_connect` | F58 the 48-hour connect window and the mutual pick that makes a match |
| `13_pockets` | F51 visibility switch, F52 pockets list with counts, F53 opted-in people only, F54 wave from a pocket |
| `14_report_and_block` | F35 report with category and detail, F36 block with a confirm step |
| `15_safety_settings` | F38 pause and incognito, F37 hide a course and one person by email, then Unhide |
| `16_suspended_appeal` | F38 a suspended account sees why and appeals once |
| `17_preferences` | F43 pick preferences (three levels, saved) |
| `18_privacy_account` | F39 data export, F40 consent withdrawal, F42 notifications text, F41 account deletion and sign-out |
| `19_profile_photos_and_edit` | F12 photos from the system picker (and removing one), F11 free-time grid, F14 going back to edit and finishing, F15 the sensitive question |
| `20_selfie` | F13 selfie through the phone's camera: waiting, rejected with a reason, verified |
| `21_wave_cap` | F25 the ninth wave of the day is refused |
| `22_session_and_offline` | F03 an ended session sends the person to sign in, F49 offline state, empty lists, Try again |
| `23_language` | F47 switch to Korean and back |
| `24_links_and_share` | F48 deep links (signed out and in, chat, event, a link that points nowhere) |
| `25_share_and_external` | F48 the native share sheet, F19 the page that opens outside the app |
| `26_invite_code` | F07 invite code (tag `cohort`: needs `COHORT_RELEASE=on` on the website) |
| `27_cohort_closed` | F20 Dating closed for a small group (tag `cohort`) |
| `28_upgrade_gate` | F04 the update message (tag `upgrade`: needs `MIN_APP_VERSION=9.0.0` on the website) |
| `29_dark_mode` | dark mode: every tab and the chat open and work with the emulator in night mode (tag `dark`; see the flow's header) |

## How it works

- **The app under test** is a *release-style* build with its JavaScript bundled in (no Metro), made with
  `OVERLAP_TEST_BUILD=1`, which only adds permission for plain `http://` to a website on the same computer
  (`app.config.js`). A normal build never allows plain http.
- **`helper.mjs`** is a small server on `127.0.0.1:3999` that does what a flow cannot: it reads the sign-in code from the dev
  outbox (the website only writes it there, nothing is really sent) and sets up other people (accounts, a match, a message)
  through the app's own mobile API. It refuses to start unless the website and database are on localhost and storage is
  the local folder. Every account it makes starts with `mae.`, and `POST /cleanup` removes only those.
- **`scripts/*.js`** run inside Maestro (so they use its `http`, `json` and `output`), **`subflows/`** are shared steps,
  **`flows/`** are the tests.
- The app has `testID`s on its text inputs and pickers (`email-input`, `code-input`, `birth-year`, `first-name`,
  `year-picker`, `search-input`, `prompt-picker-0`, `value-0-4`, `wave-note`, `chat-input` and so on) because a label
  and its input share a name.

## Run it on this machine (Windows)

Needs the Android SDK and JDK 17 (see `mobile/README.md`) and Maestro unpacked somewhere on `PATH`
(`https://github.com/mobile-dev-inc/maestro/releases`, the `maestro.zip`).

1. Start the emulator (`emulator -avd overlap_pixel -gpu swiftshader_indirect -no-snapshot`) and the local database.
2. In the shell that starts the website **and** the helper, use the local database and local storage:
   `DATABASE_URL`/`DIRECT_URL` on localhost, `SUPABASE_SECRET_KEY=""`, `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`.
   Then `npx next dev -p 3000` from the repo root (the storage probe `GET /api/dev-storage/profile-photos/x` must answer 401).
3. Start the helper: `node mobile/maestro/helper.mjs`.
4. Build and install the app (from `mobile/`, once, and again after any change to the app):
   `OVERLAP_TEST_BUILD=1 npx expo prebuild --platform android --no-install`, then in `mobile/android`
   `OVERLAP_TEST_BUILD=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 ./gradlew assembleRelease -PreactNativeArchitectures=x86_64`
   (put `sdk.dir=C:/Users/<you>/android-sdk` in `mobile/android/local.properties` first), then
   `adb install -r app/build/outputs/apk/release/app-release.apk`.
5. Put a few pictures on the phone for the photo flow: `adb push e2e/fixtures/photo-with-exif.jpg /sdcard/Pictures/maestro-photo-1.jpg`, then `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/maestro-photo-1.jpg` (use `MSYS_NO_PATHCONV=1` in Git Bash). The emulator's own gallery pictures also work.
6. Run the normal flows: `maestro test mobile/maestro/flows --exclude-tags=cohort,upgrade,dark` (25 flows, about 45 minutes) or one flow, `maestro test mobile/maestro/flows/05_wave_with_note.yaml`.
7. The tagged flows need the website started differently, so run them on their own: start the website with `COHORT_RELEASE=on` and run `--include-tags=cohort`; start it with `MIN_APP_VERSION=9.0.0` and run `--include-tags=upgrade` (the helper cannot sign anyone up in that mode, the flow needs none). Restart the website normally afterwards.

`10.0.2.2` is how the emulator reaches the computer; the Maestro scripts run on the computer and use `localhost`.

## Writing a flow

- Start with `cleanup.js` if the flow makes people, so the previous run's accounts cannot appear in its picks.
- A card in Today's picks is taller than the screen: use `scrollUntilVisible` before tapping a button lower down.
- Keep JSON out of Maestro variables (quotes break its templating): build the body inside a script from plain variables.
- Order of cards in a list is not fixed, so give a flow one other person at a time, or assert through the helper.
- A regex must match a whole text, and the app often joins words into one text (`Given · Needed to use Overlap`, `Thanks for reporting. This account is now hidden...`): use a leading and trailing `.*`. Keep non-ASCII characters out of the YAML (Windows reads it in the wrong encoding): match them with `.`.
- A value with a colon needs quotes (`text: "Reason: repeated spam"`).
- Two buttons with the same label (`Hide` for a course and for an email) need `index`; a swipe that starts on a button can press it, so scroll from the left edge (`start: 3%, 70%`) over a list of buttons; `pressKey: Escape` closes the keyboard, `hideKeyboard` can press Back and leave the screen.
- The helper checks the database for up to ten seconds (`scripts/safety.js`, `expect_privacy.js`), because the app's request lands a moment after the tap.
