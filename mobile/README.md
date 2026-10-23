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

## Checks (the same ones CI runs)

`npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npx expo export --platform android`.

## Rules for this folder

- Install packages with `npx expo install <package>` so versions match the SDK.
- No secrets in the app: anything in the bundle can be read by anyone. Only `EXPO_PUBLIC_*` values are bundled and they must be non-secret.
- The app talks to the backend only through `/api/mobile/v1/*` and Better Auth's `/api/auth/*`.
- `bundleIdentifier` and `package` (`tech.overlaps.app`) are permanent once the first build is published. Confirm before the first store upload.
