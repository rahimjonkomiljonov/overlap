# Go/no-go sheet (S25)

This is `BUILD_PLAN.md` §6, item by item, with the real status as of **2026-10-04** and
the evidence behind each one. S25 is done when every hard blocker is green. Items the
owner accepts as a risk instead are written into the BUILD_PLAN Progress Log, with the
date and the reason.

Legend: **Green** = done and verified · **Code-ready** = built and tested, still needs
production or the owner to confirm · **Open** = not done.

The rule from §6 stands: consent, sensitive-data and safety items can never be waived.
If a blocker fails, launch smaller (invite-only, 50 users or fewer) or delay.

## Privacy and legal

| Blocker | Status | Evidence / what's left | Owner |
|---|---|---|---|
| Consent ledger works; sensitive consent separate and optional; no RRN or CI stored | **Green** | Append-only versioned ledger with unit tests (S05). The e2e test shows that declining the sensitive consent still creates the account, with Dating off. Withdrawal turns Dating off and deletes the field (S19 e2e). The schema has no RRN or CI columns | — |
| Korean Terms, Privacy Policy and Community Guidelines live; processor and overseas-transfer disclosures match the real data flow | **Code-ready** | Pages are live in ko and en, with a "DRAFT" banner. A unit test keeps the processor list in sync with `docs/data-flow.md`. Vercel's region was corrected to Seoul (`icn1`) on 2026-10-04. Remove the DRAFT banner only after the lawyer review | Owner |
| Lawyer review done, or a written risk acceptance | **Open** | O6 | Owner |
| CPO named and published; PIPC CPO report and MSIT value-added telecom report filed | **Open** | O1, O7. Keep the receipts | Owner |
| Database and storage in Seoul; processor terms accepted | **Code-ready** | Supabase is `ap-northeast-2`. Functions are pinned to `icn1` (check after the next deploy). Accepting the Supabase, Vercel and Resend data-processing terms is O7 | Owner |
| Age check: Track A live, or Track B accepted in writing | **Code-ready** | Track B (birth year + attestation, 19+) is built and tested. Track A is a stub until an agency contract exists (O5). Needs the owner's written acceptance in the Progress Log | Owner |

## Safety (never waivable)

| Blocker | Status | Evidence / what's left | Owner |
|---|---|---|---|
| Report, block and hide-from work end to end; safety tests green | **Green** | `e2e/safety.spec.ts` passed in the 2026-10-04 full desktop and mobile runs | — |
| Two moderators trained and on call | **Open** | O9. Promote them with `npm run db:promote-role -- --role MODERATOR` | Owner |
| Urgent SLA (< 2 h) agreed | **Code-ready** | Written in `docs/moderation-playbook.md`. The admin queue sorts urgent reports first (e2e tested). Needs the on-call rota to make it real | Owner |
| Emergency numbers verified | **Open** | National numbers (112, 119, 1366) are code constants. Gachon Human Rights Center (sexual harassment/violence) set to 031-750-8964 / 8965 from the official site on 2026-10-05 and imported. **Campus security is still the main switchboard** (031-750-5114). Phone each campus number once before launch (`reference-data/gachon/README.md`) | Owner |
| Police-referral procedure written | **Green** | `docs/moderation-playbook.md` (evidence preservation, referral checklist) | — |

## Product and operations

| Blocker | Status | Evidence / what's left | Owner |
|---|---|---|---|
| Golden-path e2e passes against production | **Open** | Passes locally (desktop and mobile, 2026-10-04). Production needs the manual team smoke test in `docs/deploy-runbook.md` §5 | Team |
| Matching tests green | **Green** | Unit tests pass (`npm run check`: 69 files, 453 tests) | — |
| No synthetic users in production | **Code-ready** | `npm run db:check-readiness` checks this. Run it against the production database | Operator |
| Backups verified | **Open** | The current Supabase project is on Free, which has **no backups**. Production needs Pro + PITR, then one test restore | Owner |
| No critical or high bug open | **Green** | Fixed 2026-10-04: screens not updating after actions (16 components), and a `/picks` crash on concurrent loads. No known critical or high bug is open | — |
| Tabletop breach drill done once | **Open** | Walk through `docs/incident-runbook.md` once with the team | Owner |
| 150+ verified users or a 300+ waitlist; ambassadors briefed | **Open** | O8 | Owner |

## Also needed before the first cohort (not in §6, found during prep)

| Item | Status | Notes |
|---|---|---|
| Cohort release with invite codes (REQUIREMENTS J2, P0) | **Code-ready** | Built 2026-10-04 behind `COHORT_RELEASE=on`: invite code required at onboarding, Dating gated per cohort by the density gate (enforced in the wizard, the intents action and matching). Unit tests, a rollback-only test against real Postgres, and `e2e/cohort-release.spec.ts` (run with the flag on) pass. Gender-share rule (women and men each ≥ 35%) confirmed by the owner on 2026-10-04 |
| Error tracking | **Open** | No Sentry SDK is wired. Either wire it (small task) or accept Vercel logs for the first cohort |
| Hourly notifications | **Open** | Daily on Vercel Hobby. Hourly needs Vercel Pro |
