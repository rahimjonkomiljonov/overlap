
# Overlap — Campus Web App: Full Requirements (rev 3: legally reviewed, 30-day scope)

> Working name: **Overlap**. Tagline: *"Meet the people your campus life already overlaps with."*
> Rev 2 adds a Korean and international data-protection review (§15) and applies its findings throughout.

## 1. Context

You want a web app for one campus that is not a Tinder clone and avoids six known project killers: generic concept, no users, swiping-only, no safety, ugly UI, no real matching logic. Confirmed decisions:

- **Goal:** real launch at one campus (so cold-start, moderation and legal are in scope, not just code).
- **Unique angle:** campus-life graph matching (courses, clubs, campus spots, free time, interests), with explained matches.
- **Stack:** Next.js + TypeScript + PostgreSQL.
- **Compliance:** checked against Korean law (PIPA, Network Act, Telecommunications Business Act, Location Information Act, Civil/Youth Protection Acts, AI Basic Act, sexual-crime laws) and international regimes. Findings and the resulting changes are in §15. This is a research summary, **not legal advice**.

**Assumptions (change if wrong):** one campus in **South Korea** (inferred from your request to check Korean law, so PIPA is the primary regime, the email domain is `.ac.kr`, and the UI is Korean-first with English for international students); 5k–30k students; 1–2 developers plus a part-time designer; today is 2026-09-21; target is a **first-cohort launch within 30 days (by ~20 Oct 2026, mid-semester)**, so scope is cut to a Month-1 subset (see the scope map in `BUILD_PLAN.md`); web-first installable PWA; free in v1 (no payments).

**This file is the full-product reference.** The 30-day build order is in `docs/BUILD_PLAN.md`.

---

## 2. How this plan avoids the six mistakes

| Mistake | How Overlap avoids it | Where |
|---|---|---|
| Generic Tinder clone | Matches on shared *campus life*, not just photos. Every match says *why you overlap*. Daily curated picks, not infinite swipe. Intent modes, meetups and campus events are core, not add-ons. | §3, §5 |
| No users | A dedicated cold-start plan: waitlist, ambassadors, cohort-by-cohort release, density gates, friends-first on-ramp, events as acquisition. No fake profiles in production. | §6 |
| Only swiping | 12 feature modules: verification, campus graph profile, matching engine, waves-with-notes, realtime chat, Meet-IRL planner, events, safety toolkit, admin console, notifications, analytics, privacy engineering. | §4 |
| No safety features | Safety is a first-class module: student + photo verification, hide-from controls, blur-by-default images, 2-tap reporting, moderation queue with SLAs, safe-meet toolkit, campus emergency resources. | §4-G, §4-H |
| Ugly UI | Design-first phase (design system + hi-fi prototype tested with students *before* build), performance and accessibility budgets enforced in CI. | §7, §12 |
| No matching logic | Specified algorithm: hard filters, IDF-weighted overlap score, per-intent weights, reciprocity, exposure caps, explanations, offline evaluation. | §5 |

**Added after the legal review:** a seventh rule, *compliance by design*. Orientation data, face images, private chat and location are the highest-risk data in this product, so the plan minimizes, encrypts and time-limits them (§15).

---

## 3. Product concept

### 3.1 What makes it different (differentiators)
1. **Campus Graph matching.** Compatibility from *this term's* courses, clubs/orgs, hangout spots, weekly free windows, interests and a short values quiz. Rare shared things count more than common ones.
2. **"Why you overlap."** Each recommendation shows its top 3 reasons ("You're both in CS 201 · You both study at the library on Tuesday evenings"). No black box, which also supports the automated-decision transparency rules in §15.
3. **Daily Picks, not endless swiping.** 6 curated picks per intent per day, with a clear "you're caught up" end state. Calm, not compulsive.
4. **Intent modes.** Friends / Study buddy / Dating / Open. Each has its own visibility toggle and match weights. Lowers the stakes and widens the user base.
5. **Waves with a note.** Interest must react to one specific thing (a prompt, a shared class). No blind right-swipe.
6. **Meet-IRL planner.** The product goal is a real meeting, not a chat. The app proposes public campus spots and times from both users' shared free windows.
7. **Events & mixers.** "Who's going" ranked by overlap, then a 48-hour mutual "Connect" window after the event.
8. **Safety-first.** Verified students only, invisibility controls, safe-meet toolkit, private post-meetup feedback.
9. **Semester-aware.** Courses and availability expire each term and are re-confirmed, so data stays fresh and the app has a reason to re-engage every semester.

### 3.2 Personas
- **Maya, 20, second-year:** wants dating with people they might actually see again; wary of strangers. Values verification and "why."
- **Dev, 24, new grad student:** new to the campus; wants friends and a study buddy first.
- **Sam, 20, non-binary:** needs inclusive gender options and control over who sees them.
- **Priya, club president:** wants to host events; their events are an acquisition channel for us.

### 3.3 Core loop
```
Verify (.ac.kr + 19+ identity check + selfie) → Build Campus Graph profile → Daily Picks (with "why")
   → Wave + note → Mutual match → Chat (overlap icebreakers)
   → Plan meetup (shared free time + safe public spot) → Meet → Private feedback
Side loop: Event RSVP → "Who's going" → Meet at event → 48h Connect → Match
```

---

## 4. Functional requirements

Priority: **P0** = required for a full public launch · **P1** = shortly after · **P2** = later. The **30-day first-cohort launch is narrower**: the scope map in `BUILD_PLAN.md` says which P0 items are deferred (M2).

### A. Auth & verification
| ID | Requirement | Pri |
|---|---|---|
| A1 | Sign-up only with a campus email on an allowlisted domain (Korean campuses: `*.ac.kr`); 6-digit OTP or magic link, 10-minute expiry, rate-limited. | P0 |
| A2 | **19+ only** (Korean age of majority under the Civil Act). Age is verified through an authorized Korean identity-verification agency (mobile-carrier authentication such as PASS/NICE/KCB), not a self-declared DOB. Store only the verified "19+" flag and birth year. **Never collect or store resident registration numbers**, and do not store the agency's CI/DI values unless counsel says they are needed. Fallback path for foreign students designed with counsel (no passport/ARC numbers). | P0 |
| A3 | One account per campus email; banned identities kept as a salted hash so they cannot re-register. Purpose and retention (§15.4) disclosed in the privacy policy. | P0 |
| A4 | Photo verification: user submits a live pose selfie, a moderator approves (SLA 12 h); **the selfie is deleted within 7 days of the decision** and only the "verified" flag is kept. Users must be verified to appear in others' picks or send waves. | P0 |
| A5 | Session management, "log out everywhere", pause account, delete account (purge within 30 days). | P0 |
| A6 | Automated liveness/face-compare. **Creates biometric data (sensitive information under PIPA): needs separate explicit consent, no stored face templates, immediate deletion, and counsel sign-off before build.** | P1 |
| A7 | Graduation handling: accounts archived 60 days after graduation date unless re-verified. | P1 |

### B. Onboarding & Campus Graph profile
| ID | Requirement | Pri |
|---|---|---|
| B1 | Onboarding in ≤ 4 minutes, step-by-step with progress; optional steps can be deferred. Korean-first copy. | P0 |
| B2 | Basics: first name, gender, pronouns, year, major. **"Who I'd like to meet"** reveals sexual orientation, which is sensitive information (PIPA Art. 23): collect it only with a separate explicit consent, encrypt at field level, never display it, never send it to analytics or logs, and use it only for matching. If a user declines, Dating mode is unavailable but Friends/Study still work. | P0 |
| B3 | Intent modes (multi-select): Friends, Study buddy, Dating, Open. Independent visibility per mode. | P0 |
| B4 | Courses this term via autocomplete from the imported public catalog; auto-expire at term end with a re-confirm prompt. | P0 |
| B5 | Clubs/orgs (동아리) from the imported campus directory. | P0 |
| B6 | Hangout spots from a curated campus-places list; opt-in; only ever shown as an overlap. | P0 |
| B7 | Weekly free-time grid (7 days × hourly blocks); private, only the overlap is revealed. | P0 |
| B8 | Interests from a curated taxonomy (~150 tags) plus moderated free text; up to 12. **The taxonomy and the score exclude sensitive categories** (religion, political views, health, sexual life, union membership). Free text or prompt content a user chooses to publish is not used for scoring. | P0 |
| B9 | 3 prompts from a library (≤ 200 chars each) and 3–6 ordered photos. | P0 |
| B10 | Values quiz: 8 Likert items (social energy, planning vs spontaneity, ambition, etc.); **no items on religion, politics, health or sex life**. | P0 |
| B11 | "What matters to me" (3 sliders: shared classes / shared interests / shared free time) that tune the user's own weights. | P0 |
| B12 | "How others see me" preview; profile strength meter; term-refresh flow. | P0/P1 |

### C. Matching engine & Daily Picks (algorithm in §5)
| ID | Requirement | Pri |
|---|---|---|
| C1 | Scheduled job produces 6 picks per user per active intent (default drop 12:00 KST, configurable). | P0 |
| C2 | Each pick card shows photos, prompts and the top-3 "why you overlap" reasons. | P0 |
| C3 | Actions: Wave (with note tied to one element) or Pass. Optional pass reason chips. | P0 / P1 |
| C4 | Finite feed: "You're caught up" end state suggesting events and inviting friends. | P0 |
| C5 | Hard filters: age range (mutual), gender/preference (mutual), intent compatibility, campus, blocked/hidden, verified, active in last 14 days. | P0 |
| C6 | Fairness: per-profile daily exposure cap and a 7-day new-user boost. | P0 |
| C7 | **Campus Pockets** (Explore): browse people in your same course/club with visibility on and compatible intent, filtered by the shared thing. Non-algorithmic route that works at low density. | P1 |
| C8 | "Second chance": a passed profile can return once after 30 days. | P1 |
| C9 | Feedback learning: re-weight scores from wave/skip/meetup outcomes (re-run the §15 automated-decision review first). | P2 |

### D. Waves, matches & chat
| ID | Requirement | Pri |
|---|---|---|
| D1 | A wave must react to one element and may carry a ≤ 140-char note; max 8 waves/day. Incoming waves appear in a "Waved at you" inbox. | P0 |
| D2 | Mutual wave creates a match (or a "connection" in Friends/Study modes). | P0 |
| D3 | Realtime text chat with typing indicator and optional read receipts; p95 delivery < 1 s. | P0 |
| D4 | 3 icebreaker suggestions generated **from templates** (no generative AI) using shared overlap elements. | P0 |
| D5 | Lifecycle: nudge if silent 72 h; expire at 7 days with one "revive". | P0 |
| D6 | Unmatch, block, report from inside the chat. | P0 |
| D7 | Image sharing in chat: blurred by default, tap to reveal, NSFW-scanned. | P1 |

### E. Meet-IRL planner
| ID | Requirement | Pri |
|---|---|---|
| E1 | "Plan a meetup" proposes 3 slots computed from mutual free windows and curated **public** Safe Spots; other user accepts or counters. | P0 |
| E2 | Confirmation card in chat and `.ics` calendar export. | P0 |
| E3 | Pre-meet safety card and "Share my plans" link to a trusted contact (expiring; shows first name, place, time as text). **No GPS or live location in v1** (Location Information Act). | P0 |
| E4 | Post-meetup check-in: "How did it go?" (great / fine / not for me / made me uncomfortable → opens report flow). Private. | P0 |
| E5 | Group meetups ("bring a friend", study sessions in Study mode). | P1 |

### F. Events & mixers
| ID | Requirement | Pri |
|---|---|---|
| F1 | Event list from verified organizers (clubs, ambassadors, Overlap-hosted); RSVP. | P0 |
| F2 | "Who's going," ranked by overlap, only users who opted in. | P0 |
| F3 | After the event, a 48-hour "Connect" window: choose people you met; mutual pick becomes a match with no wave needed. | P0 |
| F4 | Organizer tools: create event, capacity, QR check-in. | P1 |
| F5 | Themed formats (speed-friending, study-break mixers), and campus-festival campaigns. | P1 |

### G. Safety, trust & privacy
| ID | Requirement | Pri |
|---|---|---|
| G1 | 2-tap report from any card, message or profile; categories, including **non-consensual intimate images, deepfakes and illegal filming, treated as urgent**; auto-hides the reported user from the reporter. The reporter (a party to the chat) attaches the last 50 messages as evidence, which is the **only** way a human sees chat content. Disclosed in the privacy policy. | P0 |
| G2 | Block = mutual invisibility, permanent unless undone. | P0 |
| G3 | **Hide-from controls:** hide from my courses / clubs / dorm / specific emails; incognito mode; pause profile. | P0 |
| G4 | Location is never precise: only "on campus" and overlap-based statements. Last names never shown unless chosen. | P0 |
| G5 | Automated screening: image NSFW check on upload (nudity blocked in profile photos); pattern-based text filter for scams, links and phone numbers; rate limits and new-account limits. Disclosed in the privacy policy/ToS; overseas moderation APIs only after §15.5 review. | P0 |
| G6 | Emergency card, configurable per campus, one tap from chat and the meetup screen: 112 (police), 119 (ambulance), 1366 (women's emergency hotline), campus security, the campus sexual-violence / human-rights center, and the digital sex-crime victim support center. Verify all numbers before launch. | P0 |
| G7 | Post-meetup check-in "Are you OK?" prompt after the planned time. | P1 |
| G8 | Strike system: warn → 7-day suspension → permanent ban. **Suspensions and bans are decided by a human moderator, with a stated reason and an appeal path** (PIPA Art. 37-2 automated-decision rights). | P0 |
| G9 | Data export and deletion (see L2); sensitive fields stored separately from the main profile and used only for matching. | P0 |
| G10 | Internal trust score (report history, feedback) that limits reach of low-trust accounts. **Automated reach limits must be explainable and appealable, and never lead to a permanent ban without human review.** | P1 |

### H. Admin & moderation console
| ID | Requirement | Pri |
|---|---|---|
| H1 | Report queue with priority (urgent < 2 h, others < 24 h), evidence view, one-click actions, and a police-referral / evidence-preservation flow for sexual-crime reports. | P0 |
| H2 | Verification review queue. | P0 |
| H3 | User lookup with immutable audit log of every admin action. | P0 |
| H4 | Role-based access: admin, moderator, ambassador. Least privilege; moderators never see sensitive fields. | P0 |
| H5 | Content management: course/club/spot import, prompt library, campus safety resources, feature flags. | P0 |
| H6 | KPI and density dashboards (see §13). | P1 |

### I. Notifications & settings
| ID | Requirement | Pri |
|---|---|---|
| I1 | Email: picks ready, new wave, match, unread message, meetup confirmed, event reminder; per-type controls. **Two classes:** *service* notifications (match, message, meetup, safety) and *promotional* ones (event promos, referral/campaign messages). Promotional messages need a separate opt-in, sender identification, one-tap unsubscribe and an advertising label (e.g. "(광고)", confirm current rule), and are never sent 21:00–08:00 without separate night-time consent. Default quiet hours 21:00–08:00 for everything. | P0 |
| I2 | Web push notifications for the same events, same two classes. | P1 |
| I3 | Settings: visibility per mode, hide-from lists, blocked list, pause, export, delete, notification prefs. | P0 |

### J. Growth & cold-start support (see §6)
| ID | Requirement | Pri |
|---|---|---|
| J1 | Public waitlist page with `.ac.kr` verification and a live counter. | P0 |
| J2 | Cohort-based release: invite codes and release by cohort (college / dorm / club). | P0 |
| J3 | Referral links with "vouch" (rewards are badges/event access, **never** pay-to-win visibility). No address-book or contact upload (third-party personal data). | P0 |
| J4 | Ambassador dashboard (invites, cohort activation). | P1 |
| J5 | Privacy-safe shareable cards ("12 people in my Data Structures class are on Overlap"). | P1 |

### K. Analytics
| ID | Requirement | Pri |
|---|---|---|
| K1 | Event schema and funnels (signup → verified → profile complete → first wave → first match → first message → first meetup). **No sensitive fields, chat text or precise identifiers in events.** | P0 |
| K2 | Weekly KPI report and cohort retention. | P1 |

### L. Privacy & compliance engineering (new in rev 2)
| ID | Requirement | Pri |
|---|---|---|
| L1 | **Consent ledger:** versioned, timestamped, per-purpose consents (required terms/privacy; sensitive "who I'd like to meet"; optional marketing; night-time marketing; overseas transfer where the consent route is used). One purpose per checkbox, nothing pre-ticked, withdrawable any time, and refusing an optional consent never blocks core use. Re-consent when purposes change. | P0 |
| L2 | **Privacy center:** view/download my data, correct it, delete it, withdraw consent, request suspension of processing; requests tracked against the statutory deadline (confirm; 10 days) with the CPO contact shown. | P0 |
| L3 | **Retention job:** scheduled purge per the §15.4 schedule, with monitoring and a purge log. | P0 |
| L4 | **Security controls:** field-level encryption for sensitive fields, one-way hashed credentials, TLS everywhere, encrypted backups, role-based admin access, access logs kept ≥ 1 year (confirm threshold), no personal data in error tracking or analytics. | P0 |
| L5 | **Incident runbook:** detect → triage → notify affected users within 72 h, and notify PIPC/KISA within 72 h where sensitive data is involved or ≥ 1,000 users are affected. The 2026 amendment also triggers on a "meaningful possibility" of a breach and covers forgery/alteration/damage. Quarterly drill. | P0 |
| L6 | **"How matching works" page** explaining that recommendations are automated, which signals are used and how to ask for an explanation or review (PIPA Art. 37-2). | P0 |
| L7 | **Processor register and data-flow map** kept in `docs/data-flow.md` and mirrored in the privacy policy (§15.5). | P0 |
| L8 | Terms, Privacy Policy, Community Guidelines and consent screens in Korean, with English translations. | P0 |

---

## 5. Matching algorithm specification

**Pipeline:** hard filters → per-pair score → reciprocity → diversity mix → explanation.

### 5.1 Candidate generation (SQL)
Same campus, verified, active ≤ 14 days, mutual age/gender/preference fit, intent overlap, not blocked/hidden either way, not shown to this user in the last 30 days. Per-user feature sets are stored as integer arrays with GIN indexes so overlap lookups are fast. The encrypted preference field is decrypted only inside the matching worker.

### 5.2 Score
```
S(a,b) = 100 × ( wC·C + wK·K + wT·T + wI·I + wV·V )
```
| Term | Meaning | Computation |
|---|---|---|
| C | Shared courses this term | IDF-weighted overlap; same-section bonus (+25%) |
| K | Shared clubs/orgs | IDF-weighted overlap |
| T | Time & space overlap | Jaccard over weekly free-hour slots, plus shared opted-in spots |
| I | Shared interests | IDF-weighted Jaccard (non-sensitive taxonomy only) |
| V | Values alignment | 1 − normalized distance on the 8 quiz items (embeddings on prompts in P2) |

- **IDF weighting:** `w(x) = log(N / (1 + n_x))`, capped, so a shared 12-person club counts more than a shared "music" tag.
- **Per-intent weight vectors** (config, tunable):

| Intent | wC | wK | wT | wI | wV |
|---|---|---|---|---|---|
| Study buddy | .45 | .10 | .30 | .10 | .05 |
| Friends | .20 | .25 | .20 | .30 | .05 |
| Dating | .15 | .15 | .15 | .25 | .30 |

- **Personalization:** the user's 3 "what matters" sliders scale wC / wI / wT by 0.5×–1.5× and renormalize.
- **Reciprocity:** score each direction with that viewer's weights and rank by the **harmonic mean**, so a candidate is only shown if it is good for both sides.
- **Explanations:** top 3 contributing terms are rendered from templates ("You're both in {course}", "You both like {rare interest}", "You're both free {day} {daypart}"). Non-shared items are never exposed.
- **Transparency:** the algorithm is rule-based (no machine learning or generative AI in v1) and documented on the "How matching works" page (L6).

### 5.3 Daily batch composition (6 picks)
4 highest-ranked · 1 **adjacent** (rank 20–50, to avoid a filter bubble) · 1 **newcomer** (joined ≤ 7 days ago). **Exposure cap:** a profile appears in at most 25 batches/day, which prevents a few popular profiles from absorbing all attention.

### 5.4 Low-density fallback
If fewer than 6 candidates pass, fill with Campus Pockets suggestions, upcoming events and an honest message ("Only 41 verified students in your pool so far. Invite a friend to unlock more."). Never pad with fake or irrelevant profiles.

### 5.5 Evaluation (offline, before launch)
Generate a synthetic campus (dev/staging only) with planted communities and check: precision@6 for planted pairs, exposure Gini coefficient, coverage (% users receiving a full batch), score symmetry, and batch runtime.

---

## 6. Cold-start & launch plan ("no users" solved)

**Principle:** a dating product needs density, so launch by cohort, not by campus-wide open door.

| When | Action |
|---|---|
| Day 5–30 | Waitlist live by Day 5 (J1) with counter and referral. Owner recruits ~10 ambassadors across dorms, clubs (동아리), colleges/majors and student councils. Target 300+ waitlist signups by Day 30. |
| Day 25–30 | First cohort: 100–150 invited users (ambassadors and their clubs) through invite codes (J2). Run moderation and support end to end. |
| Weeks 5–8 | Open further cohorts as density gates pass; ship events (F) and Campus Pockets to keep small pools alive. |
| Later | Club-hosted mixers, campus-festival campaigns, referral vouches. |

**Density gates (tunable):** open Dating mode for a cohort only when it has ≥ 150 verified users **who pass the 19+ check** and no gender group is under 35% of the pool; until then only Friends/Study modes run. Friends-first is the on-ramp because it is lower-stakes and has a bigger audience.

**Rules:**
- **No fake profiles in production.** Seed only *reference data* (courses, clubs, spots, prompts). Demo data is for dev/staging and is clearly labeled.
- Events are an acquisition channel: RSVPs pull in friends.
- Referral rewards are badges and event access, never extra visibility.

**Liquidity KPIs:** median ≥ 30 eligible candidates per user per mode · time to first mutual wave < 48 h · ≥ 40% of new users start a conversation in week 1.

---

## 7. UX / UI requirements ("ugly UI" solved)

**Design principles:** (1) show the overlap, not just the face; (2) calm, finite, never compulsive; (3) safety is visible, not buried; (4) mobile-first and fast; (5) inclusive by default.

**Brand direction:** warm, friendly, campus-life feel. Avoid the red/pink gradient dating clichés. Rounded modern type, one bold accent, generous whitespace, real photography and illustrations.

**Design system:** Tailwind + shadcn/ui (Radix) tokens for color, type, spacing, radius, elevation; Framer Motion for meaningful motion only; light and dark themes; every screen has designed loading (skeleton), empty and error states. Consent and privacy screens are designed, not bolted on: plain language, one purpose per screen or checkbox.

**Standards:**
- WCAG 2.2 AA, full keyboard use, 44 px touch targets, `prefers-reduced-motion` respected.
- Performance budgets in CI: LCP < 2.5 s on mid-range phone over 4G, CLS < 0.1, initial JS < 200 KB per route.
- Installable PWA; iOS Safari, Samsung Internet and current Chrome/Firefox/Edge.
- **Korean-first:** all UI, legal text and emails in Korean with English for international students; subset a Korean web font (e.g. Pretendard) to protect performance; test in the KakaoTalk and Naver in-app browsers, since shared links open there.

**Usability gate (compressed for the 30-day build):** build the 8 key flows directly in the design system (BUILD_PLAN S02, S07, S12), then test them with 5 students on staging in Week 3 (target task success ≥ 90%). Full 8–10 student SUS testing follows in Month 2.

**Key screens:** waitlist/landing · sign-up + OTP · identity + photo verification · consent screens · onboarding (steps) · Daily Picks · pick detail + wave composer · Waved-at-you inbox · matches list · chat · meetup planner · pre-meet safety card · events list + detail + who's-going · Campus Pockets · my profile + preview · settings/privacy center · How matching works · admin console.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | API p95 < 300 ms; chat delivery p95 < 1 s; nightly batch for 10k users < 5 min. |
| Scale | Design for 10k MAU / 2k concurrent; `campus_id` on every tenant table so multi-campus is possible later. |
| Security | OWASP ASVS L2; HttpOnly SameSite cookies; CSRF protection; Zod validation on every input; central authorization layer; rate limiting; signed image URLs; EXIF stripped; secrets in env manager; dependency scanning; immutable audit log; field-level encryption for sensitive fields; access logs kept ≥ 1 year; no personal data in Sentry/PostHog. |
| Privacy | 19+ only; data minimization; retention schedule in §15.4; deletion within 30 days; reported evidence kept 90 days; no data sale or third-party provision; sensitive fields ("who I'd like to meet", any biometric data) need separate consent and are never displayed. |
| Availability | 99.5% during beta; daily backups with point-in-time recovery. |
| Observability | Sentry errors (EU region, scrubbed), first-party funnel metrics from the database in Month 1 (PostHog later), structured logs, uptime monitor. |
| Accessibility | WCAG 2.2 AA verified with axe plus manual keyboard and screen-reader checks. |

---

## 9. Architecture & stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Framer Motion, PWA (service worker), i18n (ko/en) | One language across the stack; strong ecosystem. |
| Backend | Next.js route handlers and server actions; domain code in `src/server/*` (auth, matching, chat, safety, events, admin, privacy) kept framework-agnostic | Testable domain logic, easy to extract later. |
| Database | PostgreSQL on Supabase **in the Seoul region**, Prisma ORM plus raw SQL for matching queries; `pgvector` reserved for P2 embeddings | Relational graph queries; managed backups; keeps core personal data in Korea (§15.5). |
| Auth | Better Auth (or Auth.js) with email OTP and domain allowlist | Confirm current API via Context7 at build time. |
| Age verification | Authorized Korean identity-verification agency (mobile-carrier authentication) | Reliable 19+ check without handling resident registration numbers. |
| Realtime | Supabase Realtime (or Ably) | Vercel serverless cannot hold long-lived WebSockets. |
| Jobs | Month 1: Vercel Cron calling protected, chunked routes (daily picks, expiry, reminders, retention purge). Later: Inngest for durable fan-out; payloads carry IDs only | Fewest moving parts for a 30-day build. |
| Cache / limits | Month 1: Postgres counters for rate limits. Later: Upstash Redis (hashed IDs only) | Avoids an extra overseas processor at launch. |
| Storage | Supabase Storage (Seoul) + `sharp` for resize/EXIF strip | Signed URLs. |
| Moderation | Image-moderation API (images only) + in-house pattern rules for text; no chat text sent to overseas APIs unless disclosed and reviewed (§15.5) | Human review as backstop. |
| Email | Resend, or a Korean transactional-email provider if the overseas-transfer disclosure is unwanted | Transactional email. |
| Regions & processors | Seoul for app, DB and storage; EU regions for analytics/error tracking (PIPC recognized EU as equivalent, Sept 2025); US processors only with a disclosure/consent path | Minimizes cross-border exposure. |
| Testing | Vitest, Testing Library, Playwright, k6 | Unit, component, e2e, load. |
| CI/CD | GitHub Actions, Vercel previews; dev / staging / prod | Lighthouse + axe gates in CI. |

**Proposed layout:** `src/app` (routes) · `src/server/{auth,matching,chat,safety,events,admin,privacy}` · `src/components` · `prisma/` · `scripts/` (catalog import, synthetic-campus generator, dev only) · `docs/` (requirements, data-flow register, incident runbook).

---

## 10. Data model (key entities)

| Entity | Key fields / relations |
|---|---|
| Campus | name, email domains, timezone, safety resources |
| User | campus_id, email_hash, birth_year, age_verified_at, status, trust_score |
| Profile | user_id, name, pronouns, year, major, visibility per intent, weight sliders |
| Preference | gender, age range, intents; `interested_in` (**sensitive**, field-encrypted, separate consent) |
| Photo | user_id, order, moderation_status, verified flag (selfie itself purged ≤ 7 days) |
| Course / Enrollment | course (code, title, instructor); enrollment (user, course, section, term) |
| Club / Membership | club; membership (user, club, role) |
| Spot | campus places; `is_safe_spot`; UserSpot (opt-in) |
| Interest / UserInterest | non-sensitive taxonomy tag; user link |
| AvailabilityWindow | user, weekday, hour block, term |
| Prompt / PromptAnswer | library prompt; user answer |
| ValuesAnswer | user, item, score (1–5) |
| IdfStat | feature type, feature id, count, idf (refreshed nightly) |
| DailyBatch / BatchItem | user, intent, date; candidate, score, top reasons |
| Wave | from, to, target element, note, status |
| Match / Conversation / Message | mutual wave; chat; content, status, moderation flags |
| MeetProposal | match, spot, slot, status, feedback |
| Event / EventRsvp / EventConnection | organizer, time, place; user RSVP; post-event mutual picks |
| Block / HideRule | blocker/blocked; hide by course/club/email |
| Report / ModerationAction | reporter, target, category, evidence; action, actor, reason, appeal status |
| Notification / AuditLog | user, type, class (service/promotional), channel; actor, action, target |
| Waitlist / Referral / Cohort | signup, referrer, cohort status |
| Consent | user, type, policy_version, granted_at, withdrawn_at, source |
| DataRequest | user, type (access/correct/delete/withdraw), status, due_at |
| Incident | detected_at, scope, notified_at (users / PIPC), remediation |

---

## 11. Route map

Public: `/` · `/waitlist` · `/login` · `/safety` · `/terms` · `/privacy` · `/how-matching-works`
App: `/picks` · `/pockets` · `/waves` · `/matches` · `/chat/[id]` · `/meetup/[matchId]` · `/events` · `/events/[id]` · `/me` · `/me/preview` · `/settings/*` · `/settings/privacy` · `/onboarding/*`
Admin: `/admin/reports` · `/admin/verification` · `/admin/users` · `/admin/content` · `/admin/metrics`

---

## 12. Roadmap

Superseded by **`BUILD_PLAN.md`**: a 30-day, step-by-step build (S00–S26) with owner tasks running in parallel, then a Month-2 fast-follow (events, Campus Pockets, agency age check, realtime chat, automated image screening, web push, PostHog).

---

## 13. Success metrics

- **North star:** meetups completed per 100 active users per week.
- **Activation:** % of verified users who complete profile, send a first wave and get a first match within 7 days.
- **Engagement:** wave → match rate, match → conversation rate, conversation → meetup rate, D7 / D30 retention.
- **Liquidity:** candidates per user, time to first mutual wave, % users receiving a full batch.
- **Safety guardrails:** reports per 1k conversations, median time to action (urgent < 2 h), repeat-offender rate, post-meetup "uncomfortable" rate (target < 2%).
- **Compliance guardrails:** privacy requests answered on time (100%), consent-withdrawal processing time, retention-job success rate, zero sensitive fields in analytics/logs.

---

## 14. Verification & acceptance gates

| Check | Method | Pass condition |
|---|---|---|
| Scoring correctness | Vitest fixtures + property tests (symmetry, IDF monotonicity, filters exclude blocked/hidden, sensitive categories never scored) | 100% pass |
| Match quality | Synthetic campus with planted communities | precision@6 ≥ 0.7; exposure Gini ≤ 0.45; ≥ 95% of users get a full batch |
| E2E flows | Playwright: signup→verify→consent→onboard→picks→wave→match→chat→meetup; event RSVP→connect | All green in CI |
| **Safety drill** | Red-team script: report a harassing user (action within SLA), report an intimate-image case (urgent path and evidence preserved), blocked/hidden user cannot see or find the reporter, hide-from-course works, under-19 verification fails closed, NSFW upload blocked, deleted account purged | Every case passes |
| Load | k6: 2k concurrent chat, nightly batch at 10k users | Within §8 budgets |
| Performance/a11y | Lighthouse CI + axe on every key screen; manual keyboard + screen reader pass | LCP < 2.5 s, no critical a11y issues |
| Usability | 8–10 students on prototype, then on beta build | Task success ≥ 90%, SUS ≥ 75 |
| Six-mistake checklist | Review each row of §2 against the running app | All six demonstrably addressed |
| **Compliance gate** | Counsel review of ToS, Privacy Policy and consent flows; data-flow map checked against §15.5; retention job dry-run; breach drill; consent tests (declining an optional consent never blocks core use; declining "who I'd like to meet" only disables Dating mode); scan that no sensitive data reaches analytics or logs; privacy-request end-to-end test | Written counsel sign-off; zero open P0 items in §15.6 |
| Beta | 100–150 users for 2 weeks | Liquidity KPIs in §6 met; no unresolved P0 bug or safety incident |

---

## 15. Legal, regulatory & data-protection review

> Research summary from public sources (list in §15.7), checked on 2026-09-21. **Not legal advice.** Have a Korean privacy/telecom lawyer sign off before launch. Items marked *(confirm)* could not be verified from sources I found. Findings assume a Korean operator, a Korean campus and a free service.

### 15.1 Laws that apply and what the plan does about them

**Korea**

| Law | Why it applies | Key obligations | Plan response |
|---|---|---|---|
| **PIPA** (Personal Information Protection Act), amended 2023; further amendment in force **11 Sep 2026** | All personal data of people in Korea, including foreign students | Consent per purpose; **sensitive information (explicitly incl. sexual orientation and biometric data) needs separate consent (Art. 23)**; resident registration numbers banned; safety measures; a designated CPO whose designation is now reported to PIPC; breach notice within 72 h; overseas-transfer rules (Art. 28-8); automated-decision rights (Art. 37-2). Fines up to 3% of revenue, and **up to 10% for repeat or grave cases**; the business representative is the ultimate responsible person; punitive damages up to 5× | §15.2–15.6; module L; B2, A2, A4, A6, G8 |
| **Network Act** (Information and Communications Network Act), Art. 50 | Promotional email and push | Explicit opt-in for profit-oriented ads; separate consent for 21:00–08:00; clear sender and easy opt-out | I1: service vs promotional classes, quiet hours |
| **Telecommunications Business Act** | In-app chat is a value-added telecom service | **Report to MSIT** before launch; confirm which extra duties (illegal-content removal etc.) apply at our scale | BUILD_PLAN owner task O7 |
| **Location Information Act** | Only if location is collected | Reporting and consent duties for location-based services | v1 collects no GPS/location; any live-location feature needs review first |
| **Civil Act / Youth Protection Act** | Adult age is 19; the Youth Protection Act counts by birth year | Contracts with minors are voidable; youth must be kept from harmful services | A2: 19+ verified by an identity agency; adult-threshold decision in §15.6 |
| **Sexual-crime laws** (Special Cases Act, 2024 deepfake amendments) and related takedown duties | Intimate imagery, deepfakes and illegal filming can be shared via profiles or chat | Making, distributing, possessing or viewing sexual deepfakes is criminal; platforms are expected to remove such content and cooperate | G1, G5, G6, H1: urgent path, evidence preservation, police procedure |
| **AI Basic Act** (in force 22 Jan 2026; one-year grace on fines) | Recommendation logic and any generative AI | Notice and labeling for generative AI; extra duties for "high-impact" AI in areas such as employment, health, finance. A rule-based campus dating recommender does not appear to fall in those areas *(confirm)* | v1 matching is rule-based; icebreakers are templates. If an LLM is added later: label it AI-generated and update the privacy policy |
| **Marriage Brokerage Business Management Act** | Regulates paid marriage-brokerage businesses (registration, fee disclosure); consumer-harm enforcement is active | Overlap is free and not marriage-brokering. Whether a monetized dating app could be reached is a counsel question | Keep copy away from "marriage/spouse"; re-review before any paid feature |
| **Protection of Communications Secrets Act** | Private chat between users | Limits on interception and disclosure of communications | Humans read chat only via user reports (G1); automated scans are pattern-based and disclosed (G5); law-enforcement requests only with valid legal process. Counsel to confirm the scanning basis *(confirm)* |

**Enforcement precedent:** the PIPC has fined Korean dating/matchmaking services after breaches, for example Duo (about US$815K) and the operator of Goldspoon (about KRW 148M), largely for weak security and over-collection (resident registration numbers, marital history, religion, family details). This is why the plan minimizes collection and encrypts sensitive fields.

**International**

| Regime | Applies? | Plan response |
|---|---|---|
| **GDPR (EU/EEA)** | Only if the service targets people in the EU or monitors them. Exchange students living in Korea do not trigger it | Use it as a design benchmark (minimization, explicit consent, data-subject rights). PIPC recognized EU standards as equivalent on 3 Sep 2025, so EU-hosted processors are easy to use |
| **US laws** (CCPA, COPPA, state dating-app laws) | Not triggered: no US targeting, adults only | None in v1 |
| **China PIPL, Japan APPI, others** | Not triggered by nationals studying in Korea; PIPA governs | Revisit if you market abroad |
| **App-store policies** (Apple/Google dating and user-generated-content rules) | Only if the PWA is wrapped as native apps later | Out of scope in v1; report/block/moderation features already meet the typical requirements |

### 15.2 Gaps found in the first draft and what changed

| Draft said | Problem | Now |
|---|---|---|
| `.edu` email, 18+, self-declared DOB | Korean campuses use `.ac.kr`; adult age is 19; a typed DOB is weak evidence | A1, A2: `.ac.kr`, 19+, identity-agency check, no RRN |
| Orientation stored as a normal profile field | Sexual orientation is sensitive information: separate explicit consent and stronger safeguards | B2, L1, L4: separate consent, field encryption, Dating mode only depends on it |
| Selfie verification and later face-compare | Automated face comparison creates biometric sensitive data | A4: delete selfie ≤ 7 days; A6: separate consent, no templates, counsel gate |
| Values quiz and interest tags | Could drift into religion, politics, health | B8, B10: excluded from taxonomy and scoring |
| Stack on overseas SaaS | Overseas-transfer rules (Art. 28-8) | §15.5: Seoul region, EU for analytics, disclosures |
| Generic notifications | Network Act marketing rules | I1: service vs promotional, quiet hours, opt-in |
| Auto-hide, trust score, automated bans | Automated-decision rights (Art. 37-2) | G8, G10, L6: human review, reasons, appeal, explanation page |
| Third-party text moderation API | Sends private chat text overseas | G5, §9: patterns in-house, images only to APIs |
| Chat evidence and scanning | Confidentiality of communications | G1: only reporter-supplied evidence is read; G5 disclosed |
| Banned-user hash and other retention not defined | Retention must be stated and limited | A3, §15.4 |
| No consent record | PIPA requires separate, provable consent and no forced optional consent | L1 consent ledger |
| No breach, CPO or privacy-request tooling | PIPA duties; 2026 amendment | L2–L5, §15.6 |
| Title IX, Greek life, US-style calendar, Valentine's | US-specific assumptions | G6, §6, BUILD_PLAN: Korean emergency numbers, clubs, Korean semester calendar |

### 15.3 Consent architecture

| Consent | Type | Needed to use the service? | Notes |
|---|---|---|---|
| Terms of Service | Required | Yes | Korean text |
| Privacy policy: collection and use of required items (email, birth year, profile, courses, chat) | Required | Yes | Purpose, items, retention, processors |
| Identity check for age | Notice, required | Yes | Result stored as a flag only |
| Photo verification (manual review) | Notice | Only to appear in picks | Selfie deleted ≤ 7 days |
| Automated face comparison (P1) | **Separate, sensitive** | No | Only after counsel sign-off |
| "Who I'd like to meet" | **Separate, sensitive** | No, only for Dating mode | Own checkbox, plain purpose, revocable |
| Optional profile data (spots, availability, values) | Optional | No | Granular toggles |
| Promotional messages | Optional, separate | No | Unsubscribe in one tap |
| Night-time promotional messages (21:00–08:00) | Optional, separate | No | Off by default |
| Overseas transfer | Separate, only where the outsourcing-disclosure route does not apply | Depends | See §15.5 |

Principles: one purpose per checkbox, nothing pre-ticked, refusing an optional consent never denies the service, everything versioned in the ledger, re-consent when a purpose changes.

### 15.4 Data inventory and retention (draft; counsel to confirm)

| Data | Sensitivity | Purpose | Retention |
|---|---|---|---|
| Campus email | Normal | Login, notifications | Account life + 30 days |
| Birth year, age-verified flag | Normal | Age gate, age filter | Account life + 30 days |
| Resident registration number, CI | **Not collected** | — | — |
| Verification selfie | Personal (biometric if automated) | Photo verification | ≤ 7 days after decision |
| Profile photos, prompts | Normal | Profile | Account life + 30 days |
| "Who I'd like to meet" | **Sensitive** | Matching | Until withdrawn or account deletion; field-encrypted |
| Courses, clubs, spots, availability | Normal (behavioral) | Matching | Until term end, then re-confirm or purge after 30 days |
| Chat messages | Confidential communication | Service | 30 days after unmatch or account deletion; 90 days if attached to a report |
| Reports and moderation records | Normal | Safety | 90 days after closure; strike records for banned accounts up to 3 years |
| Banned-identity hash | Normal | Prevent re-registration | 3 years, disclosed |
| Access and admin audit logs | Normal | Security, PIPA safety measures | ≥ 1 year *(confirm threshold)* |
| Analytics events | Pseudonymous | Product improvement | 13 months; no personal or sensitive fields |
| Consent ledger | Normal | Proof of consent | Account life + limitation period (counsel) |

### 15.5 Processors and cross-border transfers

Rules in short: giving data to a processor needs a contract and a privacy-policy disclosure; sending personal data abroad is allowed with separate consent, or for outsourcing/storage needed to run the service if the recipient, country, timing/method, purpose and retention are disclosed, or to a PIPC-recognized destination (the EU since 3 Sep 2025), or to a certified recipient.

| Component | Data it sees | Location plan |
|---|---|---|
| Vercel (app hosting) | All requests in transit | Seoul function region if available *(confirm)*; disclose |
| Supabase (Postgres, Storage, Realtime) | Core data, photos, chat | **Seoul region** |
| Upstash Redis (Month 2) | Rate-limit counters, hashed IDs only | Not used in Month 1 (Postgres counters); if added: nearest region, disclose |
| Resend (email) | Email addresses and message content | US: disclose, or use a Korean provider |
| Inngest (Month 2) | IDs only | Not used in Month 1 (Vercel Cron); if added: US, disclose |
| Sentry (Month 1), PostHog (Month 2) | Errors, analytics | EU regions; scrub personal data; no sensitive fields |
| Image-moderation API | Profile and chat images | Korea/EU-hosted or self-hosted where possible; disclose |
| Identity-verification agency | Age verification result | Korean provider |

Keep the register in `docs/data-flow.md`; the privacy policy lists every recipient.

### 15.6 Pre-launch legal and operations checklist

- [ ] Register a legal operator (business registration). The operator is the personal-information processor under PIPA; if this runs through a student club or the university, agree in writing who the controller is.
- [ ] Designate a CPO (개인정보 보호책임자), publish their contact in the privacy policy and report the designation to PIPC. The business representative is the ultimate responsible person.
- [ ] Korean Terms, Privacy Policy (with processor and overseas-transfer disclosures), Community Guidelines and consent screens, reviewed by a lawyer.
- [ ] Report the value-added telecommunications business to MSIT and confirm any other duties.
- [ ] Sign entrustment/data-processing contracts with every processor.
- [ ] Contract an authorized identity-verification agency; confirm it can return an over-19 result without storing CI.
- [ ] Breach runbook and drill with the 72-hour clocks; know the PIPC/KISA reporting channel.
- [ ] Moderation staffing: named moderators, on-call rota, urgent < 2 h, training and wellbeing support, police-contact procedure for sexual-crime reports.
- [ ] Campus relations: talk to student affairs, campus security and the sexual-violence/human-rights center early; get emergency contacts; seek endorsement; confirm you may use the campus name and email domain.
- [ ] Course data is self-reported and the catalog comes from the campus public schedule. Do not access registrar or student-record systems.
- [ ] **Decision for counsel:** adult threshold. Recommended: full 19th birthday (Civil Act). Alternative: birth-year rule (Youth Protection Act), which admits more first-years but leaves the contract voidable.
- [ ] Re-review before adding payments, marriage-oriented positioning, live location, LLM features, native apps or other countries.

### 15.7 Sources

- [DLA Piper: Data protection laws in South Korea](https://www.dlapiperdataprotection.com/countries/south-korea/law.html)
- [Hunton: South Korea amends privacy law, fines up to 10% of revenue](https://www.hunton.com/privacy-and-cybersecurity-law-blog/south-korea-amends-privacy-law-to-authorize-fines-of-up-to-10-of-total-revenue)
- [Baker McKenzie: Legal bases for processing, South Korea](https://resourcehub.bakermckenzie.com/en/resources/global-data-and-cyber-handbook/asia-pacific/south-korea/topics/legal-bases-for-processing-of-personal-data)
- [Lexology: Major amendment to the PIPA (overseas transfer)](https://www.lexology.com/library/detail.aspx?g=4e246fbb-9f7a-48dc-9435-410a577d6ff8)
- [Nature: Automated decision-making under the revised PIPA](https://www.nature.com/articles/s41599-024-03470-y)
- [DataGuidance: KISA guide on the Network Act and spam](https://www.dataguidance.com/news/south-korea-kisa-publishes-revised-guide-information)
- [Kim & Chang: Value-added telecommunications services](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=30479)
- [Kim & Chang: Amended Location Information Act](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=24894)
- [IAPP: South Korea's AI Basic Act](https://iapp.org/news/a/south-korea-s-ai-basic-act)
- [Korea Herald: International age system and exceptions](https://www.koreaherald.com/article/3156687)
- [TechPolicy.Press: South Korea's approach to age assurance](https://www.techpolicy.press/south-koreas-approach-to-age-assurance/)
- [Cybernews: Korea fines dating firm after breach](https://cybernews.com/cybercrime/south-korea-fine-matchmaking-app-hackers-420000-bedroom-histories/)
- [DataGuidance: PIPC fine, Goldspoon dating app breach](https://www.dataguidance.com/news/south-korea-pipc-fines-krw-148m-triple-comma-violations)
- [KLRI: Marriage Brokers Business Management Act](https://elaw.klri.re.kr/eng_service/lawView.do?hseq=40973&lang=ENG)
- [KLRI: Protection of Communications Secrets Act](https://elaw.klri.re.kr/eng_service/lawView.do?hseq=7235&lang=ENG)
- [Korea Herald: Deepfake sex-crime legislation](https://www.koreaherald.com/article/3480484)

---

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Low density at launch | Cohort release, density gates, friends-first, events, Campus Pockets, honest low-density messaging (§6) |
| 19+ rule shrinks the first-year pool (many first-years turn 19 later in the year) | Counsel decision on the threshold (§15.6); count density gates on the eligible pool; grow by birthdays; second-year-and-up first cohorts |
| Gender imbalance in Dating mode | 35% floor gate, friends-first on-ramp, inclusive options |
| Regulatory penalty or breach involving sensitive data | Minimal collection, field encryption, Seoul hosting, incident runbook, CPO in place, counsel sign-off (§15) |
| Overseas processors create transfer exposure | Seoul region, EU for analytics, disclosures, processor contracts (§15.5) |
| Moderator capacity, including urgent sexual-crime reports | Automated screening first, priority queues, police procedure, volunteer tier with limited rights, cap cohort growth to moderation capacity |
| Privacy leak via overlap (inferring someone's schedule) | Only shared items exposed; free windows and spots opt-in; minimum-overlap thresholds; no exact times unless both propose |
| Stalking / harassment | Hide-from, mutual block, rate limits, strikes, trust score, safe-meet toolkit |
| 30-day deadline vs. full scope | Month-1 scope map in `BUILD_PLAN.md`; anything not on it goes to the fast-follow list, never into the sprint |
| Holidays and midterms shrink the window and student attention (Chuseok 24–26 Sep, Hangul Day 9 Oct, midterms typically mid/late Oct; confirm your calendar) | Owner tasks start Day 1; waitlist live by Day 5; first cohort invited as ambassadors, not the whole campus |
| Stale data | Term-based expiry and re-confirm prompts |

---

## 17. Out of scope (v1)

Native iOS/Android apps · video/voice calls · payments or premium tiers · multi-campus rollout · generative-AI features (would trigger AI Basic Act labeling) · public/social feed · GPS or live-location features (would trigger Location Information Act duties) · address-book or contact upload.

---

## 18. Open items to confirm before Step S01

1. Confirm the campus is in Korea, which campus, its `.ac.kr` domain(s) and its academic calendar (holidays and midterm week decide the exact Day-30 launch).
2. Who is the legal operator and who will be the CPO (needs a registered entity and a named person).
3. Adult threshold decision (full 19th birthday recommended) and how to verify foreign students without collecting passport/ARC numbers.
4. Which identity-verification agency, and whether it can return a 19+ result without CI storage.
5. Your available hours per week for owner tasks and reviews (the 30-day plan assumes you can unblock env keys, campus data and checkpoints within a day).
6. Whether the campus offers a public course catalog / club directory feed (else scripted import).
7. Who will staff moderation and on-call after launch.
8. Whether to seek an official campus partnership for safety resources.
9. A Korean privacy/telecom lawyer to review §15 and the legal pages.
