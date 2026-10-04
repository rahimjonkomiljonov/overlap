# Data flow and processor register (draft — DRAFT for lawyer review, O6)

> Written for S13. Not legal advice. Mirrors `docs/REQUIREMENTS.md` §15.5 and is the
> source `docs/privacy-policy` content in the app (`messages/{ko,en}.json`'s
> `Legal.privacy.processors`) is checked against — see
> `src/server/legal/data-flow.test.ts`. Every processor listed here must be named,
> with what it sees and where it's hosted, in the privacy policy. If a processor is
> added, removed or moved, update both this file and the privacy policy in the same
> change.

## Why this file exists

PIPA requires that giving personal data to any processor be disclosed (a contract plus
a privacy-policy entry), and that any cross-border transfer be disclosed with its
recipient, country, purpose, timing/method and retention (Art. 28-8) — unless the
transfer is to a PIPC-recognized destination (the EU, since 3 Sep 2025) or a certified
recipient. This file is the single register that both the privacy policy and any future
data-processing contracts are drafted from (L7).

## Current phase

**Local-only phase (standing until the owner says "publish"):** the app runs only on
`localhost` against the real Seoul Supabase project. Nothing below marked "not yet
active" is currently sending data anywhere — email sends fall back to logging the
OTP/notification to the server console (`src/server/email/send.ts`), and file storage
falls back to a local `.dev-storage/` directory when Supabase Storage credentials are
unset. The table lists the intended production shape so the privacy policy can be
written once and stay accurate as each processor is turned on, rather than needing a
rewrite at every step of the build.

## Processor register

| Processor | Data it sees | Location | Status (Month 1) | Cross-border basis |
|---|---|---|---|---|
| **Supabase (Postgres, Storage)** | All core data: account/profile records, courses/clubs/free-time, photos, verification selfies (transient, ≤ 7 days), and — once S15 ships — chat messages | Seoul region | Active | None needed (Korea-hosted) |
| **Vercel (app hosting)** | All requests in transit while the app is deployed | Seoul function region (`icn1`, pinned in `vercel.json`). From 2026-10-01 to 2026-10-04 the private deploy ran in `iad1` (US) by default, with test data only. | Active for the owner-only private Preview deploy (since 2026-10-01); production pending "publish" | None needed while functions stay in `icn1`. Re-check the deployment's `regions` field at publish time |
| **Resend (transactional email)** | Recipient email address and message content (OTP codes, match/wave/message notifications) | US | Not yet active — local-only phase falls back to console-logged codes, never a real send | Outsourcing-disclosure route (needed to run the service); disclosed recipient, country, purpose, retention |
| **Upstash Redis** | Rate-limit counters keyed by hashed user/IP, never raw personal data | Nearest available region *(confirm at time of adoption)* | Not used in Month 1 (Postgres counters instead) | Disclosed if/when adopted |
| **Image-moderation API** | Profile photos and (once S16/chat-images ship) chat images, for automated NSFW/nudity screening only — no chat text | Korea/EU-hosted or self-hosted where possible *(confirm vendor before S16)* | Not yet active — S16 | Disclosed before activation; EU is PIPC-recognized, otherwise separate consent or the outsourcing route |
| **Identity-verification agency** | Campus-email-linked age-verification result (a pass/fail flag) only — no resident registration number or CI is ever sent or stored | Korean provider | Not yet active — Track B (manual selfie + declared 19+) is used until an agency contract is signed (owner task O1/O4) | None needed (Korea-hosted) |
| **Sentry (error tracking)** | Error stack traces and request metadata, scrubbed of personal and sensitive fields before reporting | EU region | Not yet active — local-only phase (no Sentry until the owner says "publish") | EU is PIPC-recognized (3 Sep 2025) |
| **PostHog (product analytics)** | Pseudonymous event data only (see K1): no sensitive fields, chat text or precise identifiers | EU region | Not used in Month 1 (deferred to Month 2) | EU is PIPC-recognized (3 Sep 2025) |

Better Auth (session/auth) and Prisma are libraries that run inside our own server
against the Supabase database above — they are not separate third-party recipients of
personal data and so are not listed as processors here.

## What never leaves this register

- Resident registration numbers and CI are never collected (A2/A4) — nothing to
  register.
- `interested_in` (sexual orientation), selfies and chat text are never sent to
  analytics, logs or any processor not listed above with an explicit purpose for
  seeing exactly that field.
- Sensitive taxonomy categories (religion, political views, health, sexual life, union
  membership) are excluded from the interest taxonomy and values quiz entirely (B8,
  B10), so there is nothing of that kind to flow anywhere.
- Human moderators see chat content only when a reporter — a party to that
  conversation — attaches it as evidence to a report (G1); it is never scanned or
  forwarded to any processor above as a matter of course.

## Review cadence

Re-check this register whenever a processor is added, removed, or its hosting region
changes, and again at the pre-launch legal checklist (§15.6) before "publish." Each
active processor needs a signed entrustment/data-processing contract before it goes
live, per that checklist.
