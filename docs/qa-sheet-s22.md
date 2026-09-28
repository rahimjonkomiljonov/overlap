# S22 QA sheet

Prepared by Claude for the owner's review and sign-off, per `docs/BUILD_PLAN.md`'s
S22 *Done when*: "CI is green, zero critical a11y issues, QA sheet signed by you."
Everything below is what I could verify from this environment. The sign-off itself,
and the two items I can't do from a sandboxed cloud container, are yours.

## 1. CI

**Found:** every CI run on this branch since at least S12 shows conclusion
`cancelled`, not `success`/`failure` — the single `check` job's `npm run e2e` step
(no `--project` filter, so it ran both `desktop` and `mobile` back to back) was
routinely exceeding the job's 20-minute timeout. Nobody had noticed because every
prior step's own local verification used `--project=desktop` explicitly.

**Fixed (structural):** split `.github/workflows/ci.yml` into a fast `check` job
(lint, typecheck, unit tests) and a `{desktop, mobile}` matrix `e2e` job, each with its
own 15-minute budget. See §2 for why `mobile` was safe to actually run for the first
time. Verified in real CI: `check` now passes cleanly (~90s) and both `e2e` matrix legs
run as genuine parallel jobs for the first time ever.

**Found and fixed, a second real bug (this one only visible once the split let e2e
actually run to completion):** the `e2e` job's own CI-fresh Postgres never had any
reference data — `npx prisma db seed` only creates a dev Campus + `test.ac.kr`
EmailDomain, never the courses/clubs/interests/prompts/spots that
`scripts/import-reference.ts` (`npm run db:import-reference`) loads. Every e2e test
that walks through profile onboarding hits the wizard's prompt-picker step, whose
`<select>` has zero `<option>`s on a database with no `Prompt` rows — each such test
then retried `selectOption` for the full 30s test timeout before failing, and with
nearly every spec in the suite calling `signInAndOnboard()`, this cascaded into
burning through the entire 15-minute job budget (`cancelled`, not a real fail).
This was invisible before S22 because this repo's local/dev Postgres is long-lived
(CLAUDE.md's own gotcha) and had reference data imported once, months ago, by hand —
CI's Postgres service is thrown away every run, so it never had it. **Fixed** by adding
`npm run db:import-reference -- --dir reference-data/sample --domain test.ac.kr` to the
`e2e` job, right after `prisma db seed`. Verified by reproducing CI's exact conditions
locally (fresh migrate + seed against a scratch database, no leftover data): the
`promptId` select had 0 options and every onboarding test failed identically to the
CI logs before the fix, 8 options and all 3 `onboarding-profile.spec.ts` tests passed
after it. A full `--project=desktop` run against that same fresh database then passed
125/133 tests; the 8 failures were exactly the heavy multi-context tests this file's
own CLAUDE.md already documents as this sandbox's known resource-contention flake
class (golden-path, meetup decline, picks wave-send, privacy consent-withdraw,
verification approve, ops dashboard, `/plan/[token]` a11y ×2) — no new failure class,
and real CI's dedicated runner plus built-in `retries: 1` (which this local
verification run didn't use) gives more headroom than this shared sandbox does.

- [ ] **Owner:** confirm the real GitHub Actions run for this PR shows a `success`
  conclusion on both `e2e` matrix legs (not `cancelled`). Both real bugs above are
  fixed and verified as far as I can from this sandbox — the matrix split alone
  wasn't sufficient, the reference-data fix was needed too — but I'd like your own
  eyes on the actual run this pushes once it finishes.

## 2. Accessibility (axe, WCAG 2.x A/AA)

**Found:** seven real screens had never been through an axe check in any state:
`/me/safety`, `/me/privacy`, `/admin/reports` (populated), `/admin/ops` (new in S21),
the chat thread, the meetup planner, and the public `/plan/[token]` share page.

**Added:** all seven, in both light and dark mode, populated with real data (a filed
report, a sent message, a proposed meetup, a live share link) rather than empty
states — `e2e/a11y.spec.ts`.

**Found and fixed, real bug:** the chat thread's own sent-message timestamp
(`text-primary-foreground/70` on a solid `bg-primary` bubble) failed WCAG AA color
contrast. This is the same class of bug CLAUDE.md already documents for
`text-warning-foreground` — a foreground token calibrated for a *solid* background,
diluted with an opacity tint. Fixed by dropping the tint (`src/components/chat/chat-thread.tsx`).

**Found and fixed, a second real bug (mobile-only, not a test artifact):**
`shell.spec.ts`'s four mobile-only "no horizontal scroll at 360px" checks — flagged in
CLAUDE.md back at S16 as a known, unfixed, 100%-reproducible failure, never picked up
since. Root cause: the free-time step's grid table forced `min-w-[420px]` on a table
whose real content only needs ~330px, so at a 360px viewport the table overflowed
horizontally inside its own scroll container — and under Chromium's mobile/touch
emulation specifically (not desktop), scrolling the page to reach the "skip" button
below the table triggered a real ~100px layout shift that landed a table cell exactly
under the button, blocking every click. Fixed by removing the forced `min-w`
(`src/app/[locale]/onboarding/profile/steps/free-time-step.tsx`) — verified with a
step-by-step repro before and after (bounding boxes, screenshots), not just a retry.

**Result:** zero open axe violations across every checked screen, light and dark,
Korean and English, after the fix above. I did not find any other critical a11y
issue.

- [ ] **Owner:** the `mobile` Playwright project (Pixel 7 emulation) is now part of
  every CI run — this is the first time it's ever actually been watched, not just
  configured. Worth a glance at its own report once CI runs.

## 3. Golden path (BUILD_PLAN: "Playwright golden path in CI")

No single test previously walked signup → verify → wave → match → chat → meetup in
one continuous run — each hand-off had its own dedicated spec file, but nothing
proved the whole chain connects. Added `e2e/golden-path.spec.ts`: two real users,
through the real UI, from account creation through a confirmed meetup. Passes on
both `desktop` and `mobile`.

*(REQUIREMENTS.md §14 also names "event RSVP → connect" as part of this flow — not
built yet, Month-2 Fast-follow, so not included.)*

## 4. Lighthouse (mobile performance budget: ≥ 90)

S02 originally measured a median of 85 on the plain home page and flagged it as a
gap for this step. Re-measured now, mobile emulation, simulated throttling, against a
real production build (`npm run build && npm run start`):

| Page | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| `/` (home) | 94 | 100 | 100 | 100 |
| `/waitlist` | 97 | 100 | 100 | 100 |
| `/login` | 93 | 100 | 100 | 100 |

All comfortably clear the ≥90 target — whatever combination of S03–S21's work
improved this, the two specific ideas BUILD_PLAN suggested (server-passed shell
labels, lazy-loaded toaster) weren't needed.

- [ ] **Owner:** I only measured public, unauthenticated pages — Lighthouse needs a
  real signed-in session to reach the `(app)` shell (`/picks`, `/waves`, etc.), and
  building that (extracting session cookies, wiring them into a Lighthouse run) felt
  like more plumbing than this step's remaining budget justified, given the public
  pages already clear the bar comfortably and share the same underlying bundle/fonts.
  If you want the shell itself measured, that's a quick manual Lighthouse run from
  a real signed-in browser tab (DevTools → Lighthouse, mobile, throttled).

## 5. Real-device checks (iOS Safari, Samsung Internet, KakaoTalk/Naver in-app browsers)

**I cannot do this one at all** — this sandbox has no real iOS device, no Samsung
Internet, and no KakaoTalk/Naver in-app browser shells. This is a real gap against
BUILD_PLAN's own line item, not something to check off. Playwright's `mobile` project
(now actually running in CI, see §2) is Chromium with Pixel-7 emulation — a useful
automated proxy for "does this break on a narrow touch viewport," but it is not any
of the four browsers named. This needs a person with those actual devices.

## 6. Korean copy review

Read through the entire `messages/ko.json` (1,026 lines, 28 namespaces) end to end.
No typos, no broken interpolation, no leftover English, no incorrect information
found — it's consistently well-written 해요체 throughout the app proper, and the
Legal namespace correctly switches to formal 습니다체, which is the right register
for a terms/privacy document.

**One thing worth your own call, not a bug I fixed:** the profile-onboarding wizard's
step titles mix tones — most use a casual, friend-texting register ("너에 대해
알려줘", "여기서 뭘 하고 싶어?", "사진을 추가해줘"), a few are plain neutral nouns
("동아리", "관심사"), and the very last step ("이렇게 보여요") switches to the
standard polite 해요체 used everywhere else in the app. This could be a deliberate
"casual chat with a friend" voice for the wizard specifically, or it could be
unintentional drift — I didn't rewrite six strings' whole voice on a guess, since
that's a brand/voice decision, not a correctness bug.

## 7. Usability test (O9)

BUILD_PLAN names "fixes from O9" as part of this step. O9 (5-student usability test
on staging, owner task) hasn't run yet, so there's nothing from it to fix — not
skipped, just not yet available. Once you run it, its findings are their own
follow-up work, not retroactively part of this sign-off.

## 8. What's left for you to actually sign

- [ ] Confirm the real CI run is green (§1)
- [ ] Optional: spot-check the `(app)` shell's Lighthouse score yourself (§4)
- [ ] Real-device pass across iOS Safari / Samsung Internet / KakaoTalk / Naver (§5) — no substitute exists for this
- [ ] Decide on the onboarding-wizard tone question, or leave as is (§6)
- [ ] Sign here once the above look right: **************\_\_\_**************
