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
5. Run: `maestro test mobile/maestro/flows` (all, about 10 minutes) or `maestro test mobile/maestro/flows/05_wave_with_note.yaml`.

`10.0.2.2` is how the emulator reaches the computer; the Maestro scripts run on the computer and use `localhost`.

## Writing a flow

- Start with `cleanup.js` if the flow makes people, so the previous run's accounts cannot appear in its picks.
- A card in Today's picks is taller than the screen: use `scrollUntilVisible` before tapping a button lower down.
- Keep JSON out of Maestro variables (quotes break its templating): build the body inside a script from plain variables.
- Order of cards in a list is not fixed, so give a flow one other person at a time, or assert through the helper.
