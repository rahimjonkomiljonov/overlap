# Mobile test matrix

Every function of the store apps (BUILD_PLAN §10), with the five proofs a function needs before it counts as **tested**.
Tick a box only when the proof exists. For the manual columns write the date, device and who ran it in the Notes column.

**Proofs:** **API** = contract test (authorization, validation, every error code) · **UI** = component test · **Maestro** = automated flow on the Android emulator in CI · **Android** = run by hand on a real Android phone · **iPhone** = run by hand on a real iPhone.

**Web only (not in the apps, tested by the existing web suite):** waitlist, admin and moderation consoles, legal pages, ambassador page, creating events.

| ID | Function | Step | API | UI | Maestro | Android | iPhone | Notes |
|---|---|---|---|---|---|---|---|---|
| F01 | Sign in with email code (school address only) | M02 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F02 | Personal mail address is refused | M02 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F03 | Sign out and session expiry | M02 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F04 | Force-upgrade gate (minimum app version) | M02 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F05 | Terms and Privacy consent (sensitive consent optional) | M04 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F06 | Age declaration 19+ | M04 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F07 | Invite code (when cohort release is on) | M04 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F08 | Profile wizard: basics and intents | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F09 | Course and club pickers | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F10 | Interests, prompts, values quiz | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F11 | Free-time slots | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F12 | Photo upload, reorder, delete (camera and library) | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F13 | Selfie verification | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F14 | Profile preview and edit | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F15 | "Who I'd like to meet" (sensitive, consent-gated, never leaks) | M05 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F16 | Daily picks (six, with reasons) | M06 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F17 | Pick detail | M06 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F18 | Pass | M06 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F19 | "How your picks are chosen" | M06 | ☐ | ☐ | ☐ | ☐ | ☐ | |
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
| F51 | Campus Pockets visibility switch (opt-in, off by default) | M07 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F52 | Pockets list by course and club, with member counts | M07 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F53 | Pocket people filtered by the shared thing (opted-in people only) | M07 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| F54 | Wave from a pocket | M07 | ☐ | ☐ | ☐ | ☐ | ☐ | |
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
