# Production deploy runbook (S24)

**Do not start this until the owner explicitly says "publish".** Until then the app runs
only as the owner-only private Preview deploy (see CLAUDE.md, "Private-deploy
exception"). Everything here is written so the owner, or whoever runs launch day, can
follow it top to bottom. Steps marked **(owner)** need an account, money or a signature.

S24 is done when: the production smoke test passes, backups are on, and
`npm run db:check-readiness` passes against the production database.

---

## 0. Decisions to make first (owner)

- **Domain name.** Buying it is the first paid step.
- **Supabase plan.** The Free plan has no backups at all (BUILD_PLAN O3). Production
  needs **Pro** (daily backups) plus the **PITR add-on**.
- **Vercel plan.** Hobby works, with two limits: crons can run only once a day, and the
  app is for non-commercial use. The notifications cron was hourly by design (S18), and
  Hobby forced it to daily. **Pro** restores hourly.
- **Error tracking.** `SENTRY_DSN` is validated in `src/server/env.ts`, but **no Sentry
  SDK is installed yet**. Errors go through `src/server/logging.ts`'s `captureError`,
  the scrubbed chokepoint the SDK would plug into. Wiring Sentry is a small code task.
  Launching without it is acceptable if errors are watched in Vercel's runtime logs.

## 1. Fresh production database (owner + operator)

**Never reuse the development project (`yhiufkwpohjzmkxbekxo`).** It holds thousands of
e2e test users, 48 test admin accounts, and the dev-only `test.ac.kr` campus.

1. **(owner)** Create a new Supabase project in **Seoul (`ap-northeast-2`)** on Pro.
   Turn on PITR.
2. Create the Storage buckets `profile-photos` and `verification-selfies`, both
   **private**.
3. From a machine with the repo, point `DIRECT_URL` at the new project and apply every
   migration:
   ```sh
   npx prisma migrate deploy
   ```
   Do **not** run `npm run db:seed`. It creates the fake `test.ac.kr` campus, and it
   refuses to run with `NODE_ENV=production` anyway.
4. Create the real campus and import its data:
   ```sh
   npm run db:create-campus -- --name "Gachon University Global Campus" --domain gachon.ac.kr
   npm run db:import-reference -- --dir reference-data/shared --domain gachon.ac.kr
   npm run db:import-reference -- --dir reference-data/gachon --domain gachon.ac.kr
   ```
5. **(owner)** Phone the campus security office, counselling center and human-rights
   center, then fix `reference-data/gachon/safety-contacts.json` if any number is wrong.
   The sexual-violence line is still a placeholder (main switchboard). Re-run the
   import afterwards.

## 2. Email (owner + operator)

1. **(owner)** Create a Resend account and add the domain.
2. Add the DNS records Resend gives you: SPF, DKIM, and a DMARC record
   (`v=DMARC1; p=quarantine; rua=mailto:<owner address>`).
3. Wait for Resend to show the domain as verified. Then send an OTP to your own `.ac.kr`
   inbox and to inboxes at two other campuses (O2). University mail servers are strict,
   so check spam folders.
4. Once `RESEND_API_KEY` and `EMAIL_FROM` are set, `sendEmail()` switches from the
   console/outbox fallback to Resend automatically. No code change is needed.

## 3. Vercel production project (operator)

Set these in the Vercel dashboard for the **Production** environment. Generate fresh
secrets for production. Never copy the development values.

| Variable | Value |
|---|---|
| `DATABASE_URL` | New project, transaction pooler (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | New project, session pooler or direct (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | New project (Config type) |
| `SUPABASE_SECRET_KEY` | New project (Secret type) |
| `FIELD_ENCRYPTION_KEY_V1` | `openssl rand -base64 32` |
| `EMAIL_HASH_PEPPER` | `openssl rand -hex 32` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `CHAT_CHANNEL_SECRET` | `openssl rand -hex 32` |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | `https://<your domain>` (no trailing slash) |
| `RESEND_API_KEY`, `EMAIL_FROM` | From step 2 |

Never set `ENABLE_DEV_UI` in production.

Then:
1. Add the domain to the Vercel project and follow its DNS instructions.
2. `vercel.json` already pins functions to **Seoul (`icn1`)**, so data is processed in
   Korea. After deploying, confirm the deployment's `regions` field shows `icn1`. If it
   doesn't, the privacy policy's processor table is wrong (`docs/data-flow.md`).
3. If on Vercel Pro, set `/api/cron/notifications` back to hourly (`7 * * * *`) in
   `vercel.json`. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
   automatically, and every cron route already checks it.
4. Deploy: `vercel deploy --prod`.

## 4. First admin and readiness check (operator)

1. Sign up on the production site with the owner's real campus email.
2. Promote that account (run with `DATABASE_URL` pointing at production):
   ```sh
   npm run db:promote-role -- --email <owner email> --role ADMIN
   ```
   Promote the two trained moderators the same way with `--role MODERATOR`.
3. Run the readiness check against production. It must print "Ready.":
   ```sh
   npm run db:check-readiness -- --domain gachon.ac.kr
   ```
   It checks for synthetic users, reference data, campus data, safety contacts, an
   active admin, and the storage buckets.

## 5. Smoke test with team accounts (team)

The automated golden-path test can't run against production: it reads OTP codes from a
local file and writes directly to the database. Two team members walk this by hand on
their phones, one in Safari and one in Samsung Internet or KakaoTalk's in-app browser:

1. Sign up with a real campus email. The OTP must arrive by email within a minute.
2. Finish onboarding, including three photos. Check that photos display.
3. Submit a selfie on `/verify`. The admin approves it in `/admin/verification`.
4. With both accounts verified and sharing a course, check that each appears in the
   other's picks after the daily batch. Trigger it manually if needed:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily-batch`.
5. Wave at each other, open the match, and exchange two chat messages. They should
   appear without reloading.
6. Propose, accept and share a meetup. Open the share link in a private window.
7. File a report from chat. It must appear in `/admin/reports`.
8. Block the other account. They must disappear from picks, waves and matches.
9. Export data from `/me/privacy`, then delete one test account.

Record the result, the date and who ran it in the BUILD_PLAN Progress Log.

## 6. Rollback plan

- **Bad deploy (code):** in Vercel, open Deployments, pick the last good production
  deployment and choose "Instant Rollback" (or run `vercel rollback`). This takes
  seconds and touches no data.
- **Bad migration:** migrations only move forward. Write schema changes as
  expand-then-contract (add the new column, deploy code that uses it, remove the old
  one in a later release), so the previous deployment still runs against the new
  schema and a code rollback alone is enough.
- **Data loss or corruption:** restore with Supabase PITR to just before the incident.
  This rolls back every write since then, so it needs the owner's decision. If personal
  data may have been exposed, follow `docs/incident-runbook.md`, which has PIPC
  notification deadlines.
- **Emergency stop:** pause the project in Vercel (Settings → General) to take the
  whole site offline while investigating.
