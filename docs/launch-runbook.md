# First-cohort launch runbook (S26)

Start only after S24 (`docs/deploy-runbook.md`) is done and S25 (`docs/go-no-go.md`)
has every hard blocker green or formally accepted. S26 is done when: the first cohort is
onboarded, the moderator on-call rota is active, and issues are triaged twice a day.

All commands run with `DATABASE_URL` pointing at the **production** database.

## How cohort release works

Set `COHORT_RELEASE=on` in Vercel's Production environment, then redeploy. With it on:

- Account onboarding asks for an **invite code**. A code puts the person in its cohort.
  A wrong, used-up, expired or other-campus code is refused, and nothing is saved.
- **Friends and Study** work for everyone right away.
- **Dating** opens per cohort, only after the cohort passes the density gate. Until then
  the Dating option is locked, with a "not open yet" note in the wizard and on `/me`, and
  that cohort's members are left out of Dating matching.

With it off (the default), nobody needs a code and the cohort gate doesn't apply. This
is how local dev, CI and the private demo run.

**Density gate:** at least 150 eligible people (active, selfie-verified, passed the 19+
check) and **women and men each at least 35% of the pool**. Non-binary and other
genders count toward the 150 but not against the 35% rule. Applied literally to every
group, the rule would keep Dating closed forever whenever a small group exists.
**(owner) Confirm this interpretation, or change it in `src/server/cohorts/release.ts`
(`DENSITY_GATE`, `summarizeDensity`).**

## Day -3 to -1: prepare

1. Create the first cohort, with one single-use code per ambassador and per invited
   student:
   ```sh
   npm run db:create-cohort -- --domain gachon.ac.kr --name "Ambassadors 1" --codes 150 --expires-days 14
   ```
   Re-running with the same name adds more codes to the same cohort. Codes are
   8 characters, case-insensitive, and skip look-alike characters (0/O, 1/I/L).
2. Hand the codes to ambassadors through a private channel, one person per code.
   Never post them publicly.
3. Brief the two moderators (`docs/moderation-playbook.md`): the urgent SLA is under
   2 hours, around the clock. Agree the on-call rota and write it down.
4. Set `COHORT_RELEASE=on` in production and redeploy (then re-run the alias step if you
   use one).

## Day 0: open

1. Ambassadors sign up first, then invite their clubs.
2. Every few hours, check the cohort:
   ```sh
   npm run db:cohort-status -- --domain gachon.ac.kr
   ```
   It shows invites used, the eligible pool, the gender split, and whether the gate
   passes.
3. Keep the verification queue (`/admin/verification`) moving. Only selfie-verified
   people count toward the gate or appear in picks.

## When the gate passes: open Dating

```sh
npm run db:cohort-status -- --domain gachon.ac.kr --open "Ambassadors 1"
```

It refuses if the gate doesn't pass. There's deliberately no override: §6 makes the
density gate a launch rule. To close Dating again (for example, if moderation can't keep
up): `--close "Ambassadors 1"`.

## Day-1 monitoring checklist (twice daily for the first two weeks)

- `/admin/reports`: anything urgent older than 2 hours? Escalate now.
- `/admin/ops`: funnel (signup → verified → profile → wave → match → message), report
  SLA stats, and recent alerts.
- `/admin/verification`: queue under a day old.
- Vercel → project → Logs: any new error pattern? (There's no Sentry yet, see
  `docs/go-no-go.md`.)
- `npm run db:cohort-status`: is the pool growing, and is the split healthy?
- Note issues, owners and fixes in a shared triage log. Fix critical and high issues
  before inviting the next cohort.

## Next cohorts

Create the next cohort with its own name (by college, dorm or club, per REQUIREMENTS J2),
and only once moderation is keeping up with the current one (REQUIREMENTS §16: cap cohort
growth to moderation capacity).
