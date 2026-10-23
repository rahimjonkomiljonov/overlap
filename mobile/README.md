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

## Server-side sign-in checks

`node scripts/check-mobile-auth.mjs` runs 12 checks against a running **local** website and its throwaway database (sign-in, own-account-only, expired, deleted, revoked and brute-forced sessions, Gmail refused on the raw route). It refuses to run against anything that is not localhost. Run the website with `MIN_APP_VERSION=9.0.0` to see the app's update screen.

## Checks (the same ones CI runs)

`npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npx expo export --platform android`.

## Rules for this folder

- Install packages with `npx expo install <package>` so versions match the SDK.
- No secrets in the app: anything in the bundle can be read by anyone. Only `EXPO_PUBLIC_*` values are bundled and they must be non-secret.
- The app talks to the backend only through `/api/mobile/v1/*` and Better Auth's `/api/auth/*`.
- `bundleIdentifier` and `package` (`tech.overlaps.app`) are permanent once the first build is published. The owner confirmed this id on 2026-10-24.
