# Go/no-go sheet (S25)

This is `BUILD_PLAN.md` §6, item by item, with the real status as of **2026-10-15** (first written 2026-10-04) and
the evidence behind each one. S25 is done when every hard blocker is green. Items the
owner accepts as a risk instead are written into the BUILD_PLAN Progress Log, with the
date and the reason.

Legend: **Green** = done and verified · **Code-ready** = built and tested, still needs
production or the owner to confirm · **Open** = not done · **Accepted risk** = not done, launched anyway with the owner's written acceptance.

The rule from §6 stands: consent, sensitive-data and safety items can never be waived.
If a blocker fails, launch smaller (invite-only, 50 users or fewer) or delay.

## Privacy and legal

| Blocker | Status | Evidence / what's left | Owner |
|---|---|---|---|
| Consent ledger works; sensitive consent separate and optional; no RRN or CI stored | **Green** | Append-only versioned ledger with unit tests (S05). The e2e test shows that declining the sensitive consent still creates the account, with Dating off. Withdrawal turns Dating off and deletes the field (S19 e2e). The schema has no RRN or CI columns | — |
| Korean Terms, Privacy Policy and Community Guidelines live; processor and overseas-transfer disclosures match the real data flow | **Code-ready** | Pages are live in ko and en, with a "DRAFT" banner. A unit test keeps the processor list in sync with `docs/data-flow.md`. Vercel's region was corrected to Seoul (`icn1`) on 2026-10-04. Remove the DRAFT banner only after the lawyer review | Owner |
| Lawyer review done, or a written risk acceptance | **Accepted risk** | Owner accepted launching without a lawyer review on 2026-10-05 (Progress Log). Terms and Privacy keep their DRAFT banner | Owner |
| CPO named and published; PIPC CPO report and MSIT value-added telecom report filed | **Accepted risk** | Owner accepted launching before O1/O7 on 2026-10-05 (Progress Log). These are the operator's legal duties; still worth doing early | Owner |
| Database and storage in Seoul; processor terms accepted | **Code-ready** | Supabase is `ap-northeast-2`. Confirmed on 2026-10-09: the production deployment's functions run in `icn1` (Seoul). Still open: accepting the Supabase, Vercel and Resend data-processing terms (O7) | Owner |
| Age check: Track A live, or Track B accepted in writing | **Accepted risk** | Owner accepted Track B in writing on 2026-10-05 (Progress Log). Track B (birth year + attestation, 19+) is built and tested; Track A stays a stub until an agency contract exists (O5) | Owner |

## Safety (never waivable)

| Blocker | Status | Evidence / what's left | Owner |
|---|---|---|---|
| Report, block and hide-from work end to end; safety tests green | **Green** | `e2e/safety.spec.ts` passed in the 2026-10-04 full desktop and mobile runs | — |
| Two moderators trained and on call | **Green** | O9. The owner confirmed on 2026-10-11 that both moderators are ready and know the job, and on 2026-10-15 that both signed up on production and were promoted to MODERATOR; the owner is already ADMIN. The on-call rota (who covers which hours) is still to be written down before invites go out | Owner |
| Urgent SLA (< 2 h) agreed | **Code-ready** | Written in `docs/moderation-playbook.md`. The admin queue sorts urgent reports first (e2e tested). Needs the on-call rota to make it real | Owner |
| Emergency numbers verified | **Green** (owner confirmed 2026-10-15 that all three campus numbers were phoned) | National numbers (112, 119, 1366) are code constants. Gachon Human Rights Center (sexual harassment/violence) set to 031-750-8964 / 8965 from the official site on 2026-10-05 and imported. **Campus security is still the main switchboard** (031-750-5114). Phone each campus number once before launch (`reference-data/gachon/README.md`). On 2026-10-11 the owner reported that the phone number works; still to record which of the three numbers were called: security 031-750-5114, counselling 031-750-5965, human rights 031-750-8964 / 8965 | Owner |
| Police-referral procedure written | **Green** | `docs/moderation-playbook.md` (evidence preservation, referral checklist) | — |

## Product and operations

| Blocker | Status | Evidence / what's left | Owner |
|---|---|---|---|
| Golden-path e2e passes against production | **Green** | Passes locally (desktop and mobile, 2026-10-04). The manual team smoke test (`docs/deploy-runbook.md` §5, `docs/smoke-test-guide.md`) was run on production by the owner and two testers, twice, and passed on 2026-10-11 | Team |
| Matching tests green | **Green** | Unit tests pass (`npm run check`: 87 files, 568 tests, 2026-10-15) | — |
| No synthetic users in production | **RED (found 2026-10-19)** | `db:check-readiness` said Ready on 2026-10-10, **before** the production class demo: `scripts/demo-campus.ts create --alias-domain gmail.com --production-demo` then put the fictional "Hartwell University" campus into production, with 23 synthetic accounts and `gmail.com` mapped to it, so **anyone with a Gmail address could join the waitlist or sign in**. The code now refuses personal mail providers outright (`src/server/auth/campus.ts`), but the production data must still be removed: `DEMO_PRODUCTION_OK=hartwell.edu npx tsx scripts/demo-campus.ts remove --production-demo`, then re-run `npm run db:check-readiness`. Never run the production demo again | Operator |
| Backups verified | **Accepted risk** | Owner chose Supabase Free (no backups) on 2026-10-05. Mitigation: weekly owner-run `pg_dump` to the owner's own encrypted disk (deploy runbook, free path) | Owner |
| No critical or high bug open | **Green** | Fixed 2026-10-04: screens not updating after actions (16 components), and a `/picks` crash on concurrent loads. No known critical or high bug is open | — |
| Tabletop breach drill done once | **Green** | Owner confirmed on 2026-10-15 that the team walked through `docs/incident-runbook.md` once. Gaps found, if any, are not recorded here; add them to the incident log | Owner |
| 150+ verified users or a 300+ waitlist; ambassadors briefed | **Open** | O8 | Owner |

## Also needed before the first cohort (not in §6, found during prep)

| Item | Status | Notes |
|---|---|---|
| Cohort release with invite codes (REQUIREMENTS J2, P0) | **Code-ready** | Built 2026-10-04 behind `COHORT_RELEASE=on`: invite code required at onboarding, Dating gated per cohort by the density gate (enforced in the wizard, the intents action and matching). Unit tests, a rollback-only test against real Postgres, and `e2e/cohort-release.spec.ts` (run with the flag on) pass. Gender-share rule (women and men each ≥ 35%) confirmed by the owner on 2026-10-04 |
| Error tracking | **Accepted risk** | No Sentry SDK is wired. Owner accepted Vercel runtime logs plus the `/admin/ops` dashboard as the monitoring for the first cohort on 2026-10-15 (free-plan rule: no Sentry) |
| Hourly notifications | **Code-ready** | `.github/workflows/cron-notifications.yml` calls the route hourly for free once `PRODUCTION_URL` and `CRON_SECRET` repository secrets exist |
