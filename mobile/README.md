# Overlap mobile app (Expo)

The App Store and Google Play app. Plan and steps: `docs/BUILD_PLAN.md` section 10. Test list: `docs/mobile-test-matrix.md`.
This folder is its own package: the website's typecheck, lint and Vercel upload ignore it.

## Run it on your Android phone (no Android Studio needed)

1. Install **Expo Go** from Google Play on the phone. This project uses Expo SDK 57; Expo's docs say a physical device with Expo Go needs an SDK 57 project.
2. On the computer, in this folder: `npm install`, then `npx expo start`.
3. Scan the QR code with the Expo Go app. The phone and the computer must be on the same Wi-Fi (or run `npx expo start --tunnel`).
4. The app opens on the M01 spike screen: it shows the server it talks to, the health check, and a sign-in with the email code.

By default the app talks to production (`https://overlaps.tech`). To use a local website instead, start it on your computer and run
`EXPO_PUBLIC_API_URL=http://<your computer's LAN address>:3000 npx expo start`. The website's `BETTER_AUTH_URL` must match.

## Run it on the Android emulator (this Windows machine)

Installed on 2026-10-23 without administrator rights, under the user profile: JDK 17 in `C:\Users\Rahimjon\java`, the Android SDK in `C:\Users\Rahimjon\android-sdk` (platform-tools, emulator, Android 16 / API 36, a Google APIs x86_64 system image) and a virtual phone named `overlap_pixel`.

1. Set `JAVA_HOME` to the JDK folder and `ANDROID_HOME` to the SDK folder, and put `platform-tools` and `emulator` on `PATH`.
2. Start the phone: `emulator -avd overlap_pixel -gpu swiftshader_indirect -no-snapshot` (add `-no-window` to run it hidden). It boots in about a minute.
3. Start a local website and database (the emulator reaches your computer at **10.0.2.2**, not localhost).
4. In this folder: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx expo start --android`. The first run installs Expo Go on the phone by itself.
5. Drive it from a script with `adb shell input tap X Y`, `adb shell input text ...`, `adb exec-out screencap -p > shot.png` and `adb shell uiautomator dump` (in Git Bash set `MSYS_NO_PATHCONV=1` or it rewrites `/sdcard` paths).

## Test push notifications on a real phone (BUILD_PLAN M14)

Expo Go cannot receive remote push (it has no native notification module), so push needs a **development build**. Android is free to test; an iPhone needs a paid Apple Developer membership and waits until the owner decides to pay.

**Once, on your accounts (nothing here is committed):**
1. Make a free Expo account, then in this folder run `npx eas-cli login` and `npx eas-cli init`. It writes the project id into `app.json` (`extra.eas.projectId`); the app cannot get a push token without it. Commit that change.
2. Make a free Firebase project, add an Android app with the package name **tech.overlaps.app**, and download `google-services.json` into this folder (it is git-ignored). Then add `"googleServicesFile": "./google-services.json"` under `android` in `app.json`.
3. In Firebase, create a service-account key (Project settings, Service accounts, Generate new private key) and upload it to Expo with `npx eas-cli credentials` (Android, Google Service Account, FCM V1). Keep the key file out of the repo.
4. On the phone: Settings, About phone, tap Build number 7 times, then turn on USB debugging and plug it in (`adb devices` must list it).

**Build and install the app on the phone:** `EXPO_PUBLIC_API_URL=http://<your PC's network address>:3000 npx expo run:android --device` (the phone cannot use `localhost` or `10.0.2.2`; the PC and the phone must be on the same Wi-Fi). The first build takes several minutes.

**Stage 1, the phone to Expo:** open the app, sign in, go to Privacy and account, tap "Turn on push notifications" and allow the prompt. Copy the token (it starts with `ExponentPushToken[`) from the `push_subscriptions` table, paste it into https://expo.dev/notifications and send a test. It should arrive.

**Stage 2, our own pipeline** (use test accounts, outside 21:00 to 08:00 Seoul time):
1. Start the website locally with `EXPO_PUSH_ENABLED=on` and the local database (see "Local test stack" in CLAUDE.md; storage stays local).
2. Sign in on the phone as account A. Make a second account B with `scripts/check-mobile-push.mjs`'s helpers or the website, and make A and B match (wave, wave back).
3. Put the app in the background, then run the job: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notifications`.
4. The phone should show a generic notification ("new match", no names or message text); tapping it opens Matches. Repeat for a wave and for a message left unread for an hour.

**Stage 3, quiet hours:** make a match after 21:00 Seoul time and run the job: nothing should arrive. Run it again after 08:00: it should arrive then.

Tick M14 in `docs/BUILD_PLAN.md` only when Android and iPhone have both passed, and say in its Progress Log line what was actually received on which phone.

## Screen-reader checklist (BUILD_PLAN M15b, by hand)

A script cannot do this: TalkBack ignores swipes sent with `adb`, so the spoken output has to be heard. Do it once on a real Android phone (Settings, Accessibility, TalkBack) and once on an iPhone (VoiceOver) when one is available, signed in with a test account that has a match.

1. Sign in with TalkBack on. The email field is announced as "School email" and the button as a button; the 6-digit code field is announced by its label.
2. Swipe through the bottom bar. Each tab is announced with its name, "tab" and its position ("Matches, tab, 2 of 5"), and the selected one says so.
3. On Picks, Matches, Waves and Events: every card reads as one sensible sentence, every button says what it does ("Wave", "Pass", "Chat", "Unmatch"), and nothing is read as "unlabelled" or "button" alone.
4. Open a chat: messages are read in order with who sent them; the text box and Send are announced.
5. Privacy and account: each switch says its name and whether it is on or off; "Delete my account" asks for confirmation before anything happens.
6. Turn the phone's text size to the largest (and the display size up too): no button is cut off, the tab bar still shows whole icons and words, and every screen can still be scrolled to its end.
7. Turn on dark mode: every screen is readable (nothing dark on dark).

Write in the Progress Log which phone, TalkBack or VoiceOver version and what was heard. The automatic part is already done: `src/server/mobile/palette-contrast.test.ts` (contrast of every text colour in both themes) and the 43-check emulator audit of names, 44 dp targets, dark mode and large text.

## Server-side sign-in checks

`node scripts/check-mobile-auth.mjs` runs 12 checks against a running **local** website and its throwaway database (sign-in, own-account-only, expired, deleted, revoked and brute-forced sessions, Gmail refused on the raw route). It refuses to run against anything that is not localhost. Run the website with `MIN_APP_VERSION=9.0.0` to see the app's update screen.

## Checks (the same ones CI runs)

`npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npx expo export --platform android`.

## Rules for this folder

- Install packages with `npx expo install <package>` so versions match the SDK.
- No secrets in the app: anything in the bundle can be read by anyone. Only `EXPO_PUBLIC_*` values are bundled and they must be non-secret.
- The app talks to the backend only through `/api/mobile/v1/*` and Better Auth's `/api/auth/*`.
- `bundleIdentifier` and `package` (`tech.overlaps.app`) are permanent once the first build is published. The owner confirmed this id on 2026-10-24.
