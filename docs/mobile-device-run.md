# Mobile device run (BUILD_PLAN M16c)

The by-hand half of the test matrix: the same 58 functions as `docs/mobile-test-matrix.md`, on **real phones**. The emulator flows
(`mobile/maestro/`, the **Maestro** column) already prove the screens work; this run proves they work on real hardware, with a real
camera, real photo library, real keyboard and real network, and it covers the four things an emulator cannot (push, and TalkBack
and VoiceOver). Record each result in the matrix's **Android** and **iPhone** columns with the date, the phone and who ran it.

## What you need

| Thing | Android | iPhone |
|---|---|---|
| A phone | Any Android 10 or newer, with a camera | Any iPhone on iOS 16 or newer |
| The app | The test build (below), installed over USB | **Expo Go** from the App Store (free). Everything works in it except push |
| The website the app talks to | Your computer, on the same Wi-Fi as the phone | The same |
| Push (F44 to F46) | A **development build** with an Expo project id and Firebase (`mobile/README.md`, "Test push notifications") | Needs the paid Apple Developer membership; waits until you decide to pay (M14, G8) |
| Screen reader | TalkBack (Settings > Accessibility) | VoiceOver (Settings > Accessibility) |

### Point a phone at your computer

The phone cannot reach `localhost`. Use the computer's address on the Wi-Fi (for example `192.168.1.20`), and let Windows Firewall allow
port 3000 for private networks.

1. Start the test stack exactly as `mobile/maestro/README.md` describes (local Postgres, website with `SUPABASE_SECRET_KEY=""`, the helper),
   but build the Android app with `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000` instead of `10.0.2.2`, and install it with `adb install -r`
   over USB (USB debugging on). The `OVERLAP_TEST_BUILD=1` build allows plain `http://` (to any address); a normal build never does, so never hand this build to anyone else.
2. iPhone: `EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo start` in `mobile/`, scan the QR code with the iPhone's camera, open in Expo Go.
3. Sign-in codes are not emailed in this setup: they are written to `.dev-outbox.jsonl` in the repo folder. Use any `@test.ac.kr` address.
4. People to interact with: run `node mobile/maestro/helper.mjs` and ask it for them (`POST /pair`, `/group`, `/neighbours` in `helper.mjs`),
   or sign in a second phone as a second account.

Never point a phone at the production database or the production website for this run.

## The run (about 90 minutes per phone)

Do the scenarios in order; each one lists the matrix rows it settles. "Expected" is what a person should see; anything else is a bug (write it in
the burn-down table at the bottom).

| # | Scenario | Rows | Steps | Expected |
|---|---|---|---|---|
| 1 | First launch and sign-in | F01 F02 F04 | Open the app. Try a Gmail address. Then a `@test.ac.kr` address and the code | Gmail is refused with a plain message; the code signs you in. With the website's minimum version raised (`MIN_APP_VERSION=9.0.0`), only an update message shows |
| 2 | Account setup | F05 F06 F07 | Birth date making you 17, then a real one; tick Terms; leave the Dating consent off. With `COHORT_RELEASE=on`, a wrong then a right invite code | Under 19 is refused; consent is optional; the invite step refuses a wrong code |
| 3 | The profile | F08 to F15 | Fill the whole wizard. Pick photos from the library **and** with the camera. Go back and edit. Do the selfie | Every answer is kept. Photos appear. The selfie says it is waiting. "Who would you like to meet" shows only if you gave the consent |
| 4 | Picks | F16 to F20 | Open today's picks, open one, pass one, open "How your picks are chosen" | Reasons are shown; the web page opens in the phone's browser and Back returns |
| 5 | Waves and matches | F21 to F25 | Wave with a note, receive a wave, wave back, decline one, reach the daily limit | A mutual wave is a match; the limit message is plain |
| 6 | Chat | F26 to F29 | Send and receive messages (use two phones, or the helper's `/message`), use an icebreaker, unmatch | Replies arrive without leaving the screen |
| 7 | Meetups | F30 to F34 | Plan a meetup, propose, accept on the other side, share the plan, open the emergency card | Times fall in both people's free time at public spots; the share sheet opens; the emergency numbers dial |
| 8 | Safety | F35 to F38 | Report with a note, block (confirm step), hide a course, pause, incognito | Each does what it says; a suspended account sees why and can appeal |
| 9 | Privacy | F39 to F43 | Download my data and share it, withdraw the sensitive consent, set pick preferences, delete the account | Nothing is erased on deletion day one; you are signed out |
| 10 | Pockets and events | F51 to F58 | Switch Pockets on, open one, wave from it; RSVP to an event with and without the listing, use the 48-hour connect window | Only people who opted in appear |
| 11 | Language and links | F47 F48 | Switch to Korean and back. Open `overlap://waves` and a chat link from Notes or a message | Everything follows the language; links land on the right screen |
| 12 | Bad network | F03 F49 | Turn Wi-Fi off in the middle of a list, then on. In the website's database end the session | The screen says it is offline and recovers; an ended session goes to sign-in |
| 13 | Push (Android development build) | F44 F45 F46 | Allow notifications, get a match, a wave, an unread message. Try after 21:00 Seoul time | Generic text only, no names. Nothing between 21:00 and 08:00; it arrives in the morning |
| 14 | Screen reader and text size | F50 | Turn TalkBack (or VoiceOver) on and go through sign-in, picks, a chat, the report panel. Set the phone's font size to the largest | Every button is read with its purpose; nothing is cut off at the largest size |

Also look at **dark mode** on each phone (Settings > Display) once, on the picks, a chat and the profile.

## Recording results

For each row in `docs/mobile-test-matrix.md`, tick **Android** (or **iPhone**) and add to Notes: `2026-MM-DD, <phone model>, <who>`. A row that
fails is not ticked; write the bug below instead. When every row is ticked or has a written exception you accept, M16 is done.

## Bug burn-down

| # | Found | Where | What | Status |
|---|---|---|---|---|
| 1 | 2026-10-31, Maestro | Campus Pockets | After switching it on, the list kept "0 people" until a pull to refresh | Fixed in M16b (`mobile/src/app/pockets.tsx`) |
| 2 | 2026-10-31, Maestro | Any screen | An ended session left the person on "check your connection" instead of sign-in | Fixed in M16b (`mobile/src/lib/api.ts`) |
| 3 | known | Website, `login-form.tsx` | A `router.push` during render still warns (it navigates anyway); see CLAUDE.md | Open, low |
| 4 | known | `npm run check` | Three tests (`candidates.test.ts` twice, `export.test.ts`) only pass with a local `FIELD_ENCRYPTION_KEY_V1`; they fail without it | Open: set the dummy key in the local shell |
| 5 | known | Push (M14) | No Expo project id yet, so a real token cannot be made; Firebase credentials not added | Open: needs `eas init` and Firebase, then scenario 13 |
| 6 | known | Korean (M15c) | The Korean strings need a native reader (G7) | Open |
| 7 | known | Accessibility (M15b) | The spoken TalkBack and VoiceOver pass has not been done | Open: scenario 14 |
| 8 | from the device run | | | |
