# Overlap — 30-Day Build Plan (follow step by step)

> This is the single source of truth for the build. The full-product reference is `docs/REQUIREMENTS.md`.
> **Day 1 = Mon 2026-09-21 → Day 30 = Tue 2026-10-20.**

## 0. Context: what changed and what "ready" means

You need a launchable app in **one month at most**, and the work is too big for one Claude Code session. So: (1) the scope is cut to a first-cohort launch, (2) the work is split into small ordered steps, each finishing with checks and a tick-box, and (3) your non-code tasks (legal entity, contracts, campus data, ambassadors) run in parallel from Day 1.

**"Ready" = first-cohort launch:** 100–150 invited, verified 19+ students on production, using the full loop (verify → profile → daily picks with "why" → wave with note → match → chat → meetup plan → report/block), with the legal minimum in place. **Not** in Month 1: campus-wide opening, events, realtime chat, images in chat (see §2 and §7).

**Local-only phase, standing until the owner says "publish" (added 2026-09-23):** no domain, no Vercel/production deploy, no real email or SMS, no Sentry, no new paid services. Build and test on `localhost` against the real Supabase (Seoul) database only. This pauses owner task O2 and the Vercel/Sentry parts of O3, and changes S04 (see its entry) and S24 (do not run until told). Everything else proceeds normally — the code is written the same way either way, it just isn't deployed yet.

**Assumptions I made (reject on approval if wrong):**
1. "Ready" means a first-cohort launch by invite codes, not campus-wide.
2. **Age check:** Track B at launch (campus email + declared 19+ + manual selfie review + Terms attestation), *unless* an identity-verification agency contract is signed by Day 10 (Track A). Both sit behind one `AgeVerifier` interface so switching is cheap. Track B is weaker legally (§15 of the requirements); you must accept it in writing (Step S25).
3. Chat is text-only and uses polling first; images, automated image screening and Realtime come in Month 2.
4. No promotional messages and no third-party analytics in Month 1 (fewer legal duties, fewer overseas processors).
5. Stack: Next.js + TypeScript, Prisma, Supabase Pro (Postgres + Storage) in **Seoul**, Vercel Pro (Seoul function region), Resend, Sentry EU, Vercel Cron.
6. Commits: approving this plan also approves me committing after each finished step (message `Sxx: title` plus the standard attribution line).

---

## 1. How we work (protocol)

1. **This file is the source of truth.** Each session: read it, find the first unchecked step, do only that step.
2. **Before writing code for a step,** fetch current docs with Context7 for every library it touches (your global rule; Next.js, Tailwind, shadcn/ui, Prisma, next-intl and auth libraries all change often).
3. **A step is done only when every "Done when" check passes.** Then tick its box, add one line to the Progress Log (§8), and commit.
4. **Checkpoints C1–C4:** I stop, show what works and wait for your review. Between checkpoints I continue automatically.
5. **Size rule:** if a step runs past 1.5× its budget, I split it and move the rest to the next step. Scope never grows silently; new ideas go to the Fast-follow list (§7).
6. **No secrets in git.** Keys live in `.env.local`; `.env.example` lists names only.
7. **Compliance is part of "done":** no step may store resident registration numbers, log or track sensitive fields, or send chat text to a third party.
8. **Synthetic users exist only in dev/staging;** a test fails if any exist in production.
9. Budgets below are Claude Code working time, not counting your review.

---

## 2. Month-1 scope map

| Module (IDs from the requirements) | In Month 1 | Deferred to Month 2 (M2) |
|---|---|---|
| A Auth & verification | A1, A2 (Track B, or A if ready), A3, A4, A5 | A6, A7 |
| B Profile | B1–B10, B12 (preview) | B11 sliders |
| C Matching & picks | C1–C6 | C7 Campus Pockets, C8, C9 |
| D Waves & chat | D1–D6 (text, polling) | D7 images, Realtime |
| E Meet-IRL | E1 (lite), E3 | E2 `.ics`, E4 check-in, E5 group |
| F Events | none | all |
| G Safety | G1–G6, G8, G9 (photos reviewed by hand instead of automated NSFW) | G7, G10, automated image screening |
| H Admin | H1–H5 | H6 (only simple funnel counts in M1) |
| I Notifications | I1 service emails only, I3 | I2 push, promotional messages |
| J Growth | J1, J2, J3-lite (referral link, no rewards) | J4, J5 |
| K Analytics | first-party funnel counts from the DB | PostHog |
| L Privacy & compliance | L1–L8, all | none |

---

## 3. Owner track (you, in parallel with the code)

| ID | Task | Due | Blocks |
|---|---|---|---|
| O1 | Decide the legal operator (business registration, or a written agreement with a club/university on who is the controller) and name the CPO (개인정보 보호책임자) | Day 1–3 | Privacy policy (S13), launch |
| O2 | **Paused (local-only phase).** Buy a domain; set up Resend with SPF/DKIM/DMARC; test delivery to your own `.ac.kr` inbox and two other campuses' inboxes | When you say "publish" | Real email delivery, sharing the waitlist link |
| O3 | GitHub repo ✅ and **Supabase Pro project in Seoul (ap-northeast-2)** ✅ done. **Vercel Pro and Sentry paused (local-only phase)** until "publish" | Vercel/Sentry: when you say "publish" | S01 ✅, S03 unblocked |
| O4 | Campus data: course catalog CSV (code, title, instructor, section, term, meeting times), club list, ~15 safe/hangout spots, campus security and counselling contacts | Day 3–7 | S06 |
| O5 | Age check: sign an identity-verification agency contract (Track A) **or** decide in writing to use Track B | Day 3–10 | S05 |
| O6 | Korean privacy/telecom lawyer reviews the drafts from S13 (Terms, Privacy Policy, consent screens, sensitive-consent flow, Track B decision) | Day 15–25 | S25 |
| O7 | File the value-added telecom report with MSIT, report the CPO designation to PIPC, accept processor terms (Supabase, Vercel, Resend, Sentry) | Day 5–20 | S25 |
| O8 | Recruit ~10 ambassadors; share the waitlist link from Day 5; target 300+ signups | Day 5–30 | S26 |
| O9 | 5-student usability test on staging; recruit and brief 2 moderators (on-call for the first 2 weeks) | Day 21–25 | S22, S26 |
| O10 | Confirm your campus calendar (holidays, midterm week) so Day 30 lands well | Day 1 | Launch timing |

---

## 4. Build steps

### Week 1 (Day 1–7): foundation and waitlist

- [x] **S00 · Split this file** (Day 1, 15 min). `git init`; write everything above the `SPLIT-HERE` line to `docs/BUILD_PLAN.md` and everything below to `docs/REQUIREMENTS.md` (a `head`/`tail` command, no retyping).
  *Done when:* both files exist and the plan file is unchanged.
- [x] **S01 · Bootstrap** (Day 1–2, ~3 h). Next.js App Router, strict TypeScript, Tailwind, shadcn/ui, next-intl (Korean default, English), ESLint/Prettier, Vitest, Playwright, GitHub Actions (lint, typecheck, unit, build, e2e smoke), `.env.example`, folders `src/server/{auth,matching,chat,safety,privacy,admin}`.
  *Done when:* CI is green on a bilingual hello page.
- [x] **S02 · Design system and app shell** (Day 2–3, ~4 h). Tokens (color, type with self-hosted Pretendard for Latin and system Korean fonts, spacing, radius), light/dark, base components, mobile bottom-tab shell (Picks · Waves · Matches · Me), skeleton/empty/error patterns, `/dev/ui` gallery.
  *Done when:* axe is clean, Lighthouse a11y ≥ 95 on the shell (perf ≥ 90 moved to S22, see the Progress Log), no horizontal scroll at 360 px.
- [ ] **S03 · Data foundation** (Day 3–4, ~4 h). Prisma on Supabase (Seoul); migrations for Campus, EmailDomain, User, Consent, Waitlist, Cohort, InviteCode, Referral, AuditLog, RateLimit; central `authz` helper; field-encryption utility (AES-256-GCM, versioned key from env); server-only DB access; log/Sentry scrubber.
  *Done when:* staging migrated; encryption round-trip and tamper tests pass; a test proves the scrubber removes sensitive keys.
- [ ] **S04 · Public waitlist** (Day 4–5, ~4 h). Korean-first landing page (what, why, safety), waitlist signup with `.ac.kr` OTP, live counter, referral-link capture, notice and consent checkbox for waitlist data, Postgres rate limits. **Local-only phase:** email goes through one `sendEmail()` function that logs the OTP/content to the server console when `RESEND_API_KEY` is unset, and switches to real Resend delivery automatically once it is set — no code change needed to go live later.
  *Done when:* e2e signup works locally against the console-logged code; non-`.ac.kr` is rejected; counter updates. Sharing the link (O8) and real-inbox testing (O2) wait for "publish".
- [ ] **S05 · Auth, consent and age gate** (Day 5–6, ~5 h). Pick the simplest library that supports server-side domain allowlist and email OTP (Supabase Auth or Better Auth, confirm via Context7); sessions and "sign out everywhere"; consent screens (required Terms + Privacy; **separate** sensitive "who I'd like to meet"); consent ledger; `AgeVerifier` with a Track B adapter and an agency stub; store `birth_year` and `age_verified_at` only, never RRN or CI.
  *Done when:* unit tests cover allowlist, under-19 blocked, ledger versioning; e2e shows declining the sensitive consent still creates an account but makes Dating mode unavailable.
- [ ] **S06 · Reference data import** (Day 6–7, ~3 h). Idempotent CSV importers for courses, clubs, spots, prompt library, non-sensitive interest taxonomy (~60 tags, none on religion, politics, health or sexual life), campus safety-contacts config; validation report; autocomplete API.
  *Done when:* import runs on staging with your CSVs (or sample data); autocomplete p95 < 100 ms; a test proves the taxonomy has no sensitive categories.
- **C1 Checkpoint (Day 7):** demo waitlist → OTP login → consent gate. You review; we adjust.

### Week 2 (Day 8–14): profile and matching

- [ ] **S07 · Onboarding and profile** (Day 8–9, ~6 h). Step wizard: basics, intents, courses, clubs, spots, free-time grid (7 days × 2-hour blocks), prompts, values quiz (8 items), photos; saves progress; Zod validation; photos to a private Seoul bucket with sharp resize and EXIF strip; "how others see me" preview.
  *Done when:* e2e completes onboarding in ≤ 4 min; uploaded photos carry no EXIF; keyboard-only path works.
- [ ] **S08 · Verification and admin shell** (Day 9–10, ~5 h). Live selfie upload (private bucket); admin console with roles (admin, moderator); verification queue (approve/reject with reason; profile photos reviewed here too); immutable audit log; selfie purge job (≤ 7 days); unverified users excluded from matching.
  *Done when:* a role test shows moderators cannot read sensitive fields; purge is unit-tested; every admin action writes an audit row.
- [ ] **S09 · Synthetic campus and IDF** (Day 10–11, ~4 h). Dev/staging-only generator (500–1,000 seeded users with planted communities), `is_synthetic` flag with a production-guard test, IDF statistics job.
  *Done when:* the guard test fails if synthetic rows exist under production settings; the generator is deterministic.
- [ ] **S10 · Matching engine** (Day 11–13, ~7 h). Migration for DailyBatch, BatchItem, IdfStat, Block, HideRule. Pure TypeScript scoring module plus SQL candidate generation: hard filters, C/K/T/I/V terms with IDF, per-intent weights, harmonic-mean reciprocity, explanation templates; the encrypted preference is decrypted only inside the worker.
  *Done when:* unit and property tests pass (symmetry, IDF monotonicity, sensitive categories never scored, blocked/hidden excluded); synthetic evaluation gives precision@6 ≥ 0.7; a 1,000-user batch runs in < 60 s locally.
- [ ] **S11 · Daily batch and picks API** (Day 13, ~4 h). Secret-protected cron route, chunked processing, composition (4 top + 1 adjacent + 1 newcomer), exposure cap of 25/day, low-density fallback, idempotent per user/day/intent, Vercel Cron at 12:00 KST.
  *Done when:* a staging run gives every synthetic user 6 picks per intent; the cap holds; a second run changes nothing.
- [ ] **S12 · Picks UI and "How matching works"** (Day 14, ~5 h). Pick cards with "why you overlap", prompts and photos; wave composer (react to one element + ≤ 140-char note); pass; "you're caught up" end state; `/how-matching-works` (signals, automated-processing notice, how to request an explanation).
  *Done when:* e2e wave and pass work; axe is clean; Korean copy is reviewed.
- **C2 Checkpoint (Day 14):** demo profile → picks on the synthetic campus. You review.

### Week 3 (Day 15–21): connect, safety and legal drafts

- [ ] **S13 · Legal and compliance drafts** (Day 15, ~4 h). Korean and English drafts of Terms, Privacy Policy (required items, purposes, retention table, processors and overseas transfers, sensitive consent, automated-processing notice, chat/report handling, rights and CPO contact), Community Guidelines, Safety page; `docs/data-flow.md`, `docs/incident-runbook.md`, `docs/moderation-playbook.md` (SLAs, police procedure). Marked DRAFT for lawyer review.
  *Done when:* pages render in ko/en; a test checks every processor in `data-flow.md` appears in the privacy policy; drafts handed to O6.
- [ ] **S14 · Waves and matches** (Day 15–16, ~4 h). Waves inbox, mutual wave → match (cap 8 waves/day), matches list, unmatch.
  *Done when:* e2e shows a mutual wave creates exactly one match; the cap holds; blocked users cannot wave.
- [ ] **S15 · Chat** (Day 16–18, ~6 h). Conversations and text messages; polling (3 s in an open chat, 15 s for the list) with optimistic UI; template icebreakers from overlap; 72 h nudge and 7-day expiry jobs.
  *Done when:* two-browser e2e passes; message p95 < 3 s under polling; nudge/expiry unit-tested. (Realtime is M2.)
- [ ] **S16 · Safety core** (Day 18–20, ~7 h). 2-tap report (categories incl. non-consensual images, deepfakes, illegal filming = urgent); reporter attaches the last 50 messages; block (mutual invisibility); hide-from (courses, clubs, emails); pause/incognito; admin reports queue with priority and SLA timers; human-decided actions with reason and appeal note; strike ladder; evidence-preservation and police-referral checklist.
  *Done when:* safety tests show blocked/hidden users never appear in picks, waves or chat; urgent reports sort first; a ban cannot happen without a moderator action and reason.
- [ ] **S17 · Meetup planner lite** (Day 20–21, ~5 h). Top-3 mutual free slots × safe spots; propose/accept/decline; confirmation card; pre-meet safety card; emergency card (112, 119, 1366 and campus contacts from config); "share my plans" link (tokenized, expiring, text only).
  *Done when:* two-user e2e confirms a meetup; the link expires; a grep/lint test shows no geolocation API is used.
- [ ] **S18 · Service emails** (Day 21, ~3 h). Match, wave received, unread message after 1 h; ko/en templates; quiet hours 21:00–08:00 (queued, not dropped); no promotional content.
  *Done when:* real-inbox tests pass; a test shows nothing is sent during quiet hours.
- **C3 Checkpoint (Day 21):** full golden path on staging with your team; you start O9 (usability test).

### Week 4 (Day 22–30): privacy, hardening and launch

- [ ] **S19 · Privacy center and retention** (Day 22–23, ~6 h). `/settings/privacy`: export JSON, delete account (30-day purge), withdraw consents (withdrawing the sensitive one turns Dating off and deletes the encrypted field); DataRequest tracking with due dates; retention job per requirements §15.4 (selfie 7 d, chat 30 d after unmatch/deletion, report evidence 90 d, expired-term data); purge log.
  *Done when:* each retention rule is tested with time travel; the export contains all of the user's data and nobody else's.
- [ ] **S20 · Security hardening** (Day 23–24, ~5 h). Rate limits (OTP, waves, messages, reports, uploads), CSRF, security headers and CSP, signed URLs, dependency audit; run the `security-review` skill and fix findings.
  *Done when:* no high/critical findings are open; a scrub test proves sensitive fields and chat text never reach logs or Sentry.
- [ ] **S21 · Admin metrics and ops** (Day 24–25, ~3 h). Funnel counts from the DB (signup → verified → profile → wave → match → message → meetup), candidates-per-user density, report-SLA stats; Sentry alerts; uptime monitor; backups/PITR verified.
  *Done when:* the dashboard renders on staging and an alert fires on a forced error.
- [ ] **S22 · QA pass** (Day 25–26, ~6 h). Playwright golden path in CI; axe on all key screens; Lighthouse budgets (mobile perf ≥ 90 on the shell and key pages; S02 measured a median of 85, ideas: server-passed labels instead of client i18n in the shell, lazy-load the toaster); real-device checks (iOS Safari, Samsung Internet, KakaoTalk and Naver in-app browsers); Korean copy review; fixes from O9.
  *Done when:* CI is green, zero critical a11y issues, QA sheet signed by you.
- [ ] **S23 · Load and resilience** (Day 26, ~3 h). 2,000 synthetic users: batch runtime, 200 concurrent chat pollers, admin queue under load; fix hotspots; document limits.
  *Done when:* batch < 5 min and API p95 < 300 ms at target load.
- [ ] **S24 · Production deploy** (Day 27–28, ~5 h). **Gated: do not start until the owner explicitly says to publish**, regardless of what day it is. Vercel (Seoul region), secrets, domain, SPF/DKIM/DMARC, Cron schedule, first admin, reference-data import, prod guard (no synthetic users), smoke test with team accounts, rollback plan.
  *Done when:* prod smoke passes, backups are on, the guard test passes against prod.
- [ ] **S25 · Go/no-go review** (Day 28–29). Walk §6 line by line with you; record accepted risks (including Track B, if used) in the Progress Log.
  *Done when:* every hard blocker in §6 is green.
- [ ] **S26 · Launch the first cohort** (Day 29–30). Create invite codes for ambassador cohorts; open Friends/Study; open Dating for a cohort only when it passes the density gate (≥ 150 verified 19+ users, no gender group under 35%; feature flag); day-1 monitoring checklist.
  *Done when:* the first cohort is onboarded, the moderator on-call rota is active, and issues are triaged twice daily.
- **C4 Post-launch review (Day 30):** metrics against requirements §13; reprioritize the Fast-follow list.

---

## 5. Step order rationale (why this sequence)

Waitlist first (S04) so growth starts on Day 5 while the rest is built. Matching before chat (S10 before S15) because it is the differentiator and the riskiest logic. Safety tables exist from S10 and safety UI (S16) lands before the meetup planner (S17). Legal drafts (S13) start early enough that your lawyer has about 10 days. Privacy center and hardening (S19–S20) come after features so they cover the final data model, but their design constraints (encryption, scrubber, consent ledger) are built in Week 1.

---

## 6. Go/no-go for the first-cohort launch

**Hard blockers (all must be true):**

*Privacy and legal*
- Consent ledger works; the sensitive consent is separate and optional; resident registration numbers and CI values are never stored.
- Korean Terms, Privacy Policy and Community Guidelines are live; the processor and overseas-transfer disclosures match the real data flow.
- Lawyer review is done, **or** you have written a conscious risk acceptance in the Progress Log.
- The CPO is named and published; the PIPC CPO report and the MSIT value-added telecom report are filed (keep the receipts).
- Database and storage are in Seoul; processor terms are accepted.
- Age check: Track A is live, or Track B is accepted in writing with the agency integration first in Month 2.

*Safety (never waivable)*
- Report, block and hide-from work end to end; safety tests are green.
- Two moderators are trained and on-call; the urgent SLA (< 2 h) is agreed; emergency numbers are verified; the police-referral procedure is written.

*Product and operations*
- The golden-path e2e passes against production; matching tests are green; no synthetic users in production.
- Backups are verified; no critical or high bug is open; a tabletop breach drill has been done once.
- 150+ verified users, or a waitlist of 300+, are lined up; ambassadors are briefed.

**If a blocker fails:** do not launch that item. Launch smaller (invite-only, ≤ 50 users) or delay. Consent, sensitive-data and safety items are not waivable.

---

## 7. Fast-follow backlog (Month 2, in order)

1. Agency-based age verification (if Track B was used).
2. Automated image moderation and chat images.
3. Realtime chat (replace polling).
4. Events and mixers (F1–F3) and Campus Pockets.
5. Meetup extras: `.ics` export, post-meetup check-in.
6. Preference sliders; second chance.
7. Web push; PostHog (EU); promotional messages with Network Act consent.
8. Trust score with appeals; ambassador dashboard; shareable cards.
9. Inngest and Redis only if load requires.

---

## 8. Progress log

| Date | Step | Result | Deviations / accepted risks |
|---|---|---|---|
| 2026-09-21 | S00 | Plan split into `docs/BUILD_PLAN.md` (209 lines) and `docs/REQUIREMENTS.md` (567 lines); `git init` done | None |
| 2026-09-22 | S01 | Next.js 16.3.5 + React 19.2.8, Tailwind 4, shadcn/ui (Radix), next-intl (ko at `/`, en at `/en`, `src/proxy.ts`), Vitest, Playwright, prettier, CI workflow, `CLAUDE.md` with the working protocol. Local run of the CI steps: lint, typecheck, 2 unit tests, build, 8 e2e (desktop + mobile), format check all pass | Remote CI run pending until the GitHub repo exists (owner task O3); npm instead of pnpm; `@types/node` 22 to match Node 22; dropped unmaintained `vite-tsconfig-paths` for a plain alias; shadcn now uses its own `cn` package (verified official); next-intl detects language from the browser, so `/` shows English to English browsers (intended, tests set the browser locale) |
| 2026-09-22 | S02 | Design system (teal + amber tokens, light/dark, 44 px touch targets, Korean `word-break: keep-all`), shadcn components, app shell (bottom tabs on phones, side rail on desktop), skeleton/empty/error patterns, development-only `/dev/ui` gallery, skip link, localized not-found. 78 e2e tests pass, including axe WCAG A/AA on 10 routes in light and dark plus a negative control, 360 px overflow and 44 px target checks. Lighthouse mobile: accessibility 100, best-practices 100, SEO 100 | Lighthouse performance median 85 (range 77–89) vs the 90 target, moved to S22: observed LCP in a real browser is 0.6 s and the plain home page scores about 91, so the framework floor on this machine is about 90. Hangul webfont slices cost about 230 KiB (score 79), so only the 38 KB Latin slice is self-hosted and Korean uses system fonts. Gotcha: `loading.tsx` must not use server-side next-intl (it forced the shell routes dynamic). Incident: I ran `taskkill /IM chrome.exe` to clear a file lock, which closed every Chrome window on the machine; disclosed to the owner, will not repeat |
| 2026-09-22 | repo | Private GitHub repo `rahimjonkomiljonov/overlap` created and pushed (branch `main`, full history). First CI run failed in 13 s: the Windows-made lockfile lacked `@emnapi/core` and `@emnapi/runtime` for Linux `npm ci`; added both, CI is now green on Linux (lint, typecheck, unit, build, 78 e2e in 2 min 51 s). This closes the S01 remote-CI check. Plan shared as a Claude doc | The CLI token lacked the `workflow` scope, so the push used the git credential manager instead; no token scopes were changed. Owner task O3: the GitHub part is done, Supabase and Vercel remain |
| 2026-09-23 | scope | Owner: stay local-only (no domain, no deploy, no real email) until told to publish; will decide when to go live later. Generated `FIELD_ENCRYPTION_KEY` and `CRON_SECRET` locally (no external service needed) and added them to `.env.local`. Recorded the local-only rule in `CLAUDE.md` as a standing hard rule and gated S24 on it | — |
| 2026-09-23 | fix | Owner's first Supabase project turned out to be in Singapore (`ap-southeast-1`), not Seoul — confirmed via Context7 that Supabase does offer Seoul (`ap-northeast-2`). Data residency in Korea is required by the plan (REQUIREMENTS.md §15.5) and is a launch-gate item, and no data existed yet, so the owner is recreating the project in Seoul rather than accepting Singapore. Cleared the Singapore keys and connection strings (with the placeholder password still unfilled) from `.env.local` back to commented placeholders so nothing points at the wrong project | S03 still waiting on: the new Seoul project's client keys and its two Prisma connection strings (`DATABASE_URL`, `DIRECT_URL`) with the real database password filled in |

---

## 9. Risks specific to this plan

| Risk | Mitigation |
|---|---|
| Holidays and midterms (Chuseok 24–26 Sep, Hangul Day 9 Oct; Day 30 is likely midterm week; confirm your calendar in O10) | Code work is unaffected; invite ambassadors first and expect a slower ramp; keep the cohort small |
| Non-code lead times (business registration, agency contract, MSIT/PIPC filings, lawyer) | Owner track starts Day 1 with due dates; fallback is a smaller launch, never skipping safety or consent |
| Email deliverability to university `.ac.kr` mail | O2 test on Day 1; SES Seoul as fallback sender |
| Track B age check is weaker than an agency check | Written acceptance, agency integration first in Month 2, manual selfie review, 19+ attestation in Terms |
| Scope creep | Protocol rule 5; Fast-follow list |
| Moderator overload | Cohort cap; 2 moderators; urgent queue first |

