# Demo runbook (class presentation, 2026-10-11)

The owner paused the public launch on 2026-10-11 (legal and user-data review not done; earliest realistic date is the spring semester). For the web programming class the app is shown from a **local throwaway database with fictional people**, never production.

## Rules
- Fictional users exist only on a localhost database. `scripts/seed-demo.ts` refuses to run unless `DATABASE_URL` points at localhost/127.0.0.1.
- Never run it against the Seoul/production database (`db:check-readiness` fails if synthetic users exist there).
- No real email: with `RESEND_API_KEY` unset, sign-in codes go to `.dev-outbox.jsonl`.

## Recreate the demo
1. Start a local Postgres (any, port of your choice) and set `DATABASE_URL`/`DIRECT_URL` to it, plus the usual dummy secrets (`BETTER_AUTH_SECRET`, `FIELD_ENCRYPTION_KEY_V1`, ...) and `BETTER_AUTH_URL=http://localhost:3300`.
2. `npx prisma migrate deploy`
3. `npx tsx scripts/create-campus.ts` for `hartwell.edu`, then `npm run db:import-reference -- --dir reference-data/shared --domain hartwell.edu` and again with `--dir reference-data/demo`.
4. `npx tsx scripts/seed-demo.ts` (10 people: Emma, Liam, Sophia, Daniel, Olivia, Noah, Ethan, Grace, Jack and an ADMIN operator, all `@hartwell.edu`).
5. `npx tsx scripts/run-daily-batch.ts --domain hartwell.edu`
6. `next dev -p 3300`, sign in with any `@hartwell.edu` address and read the code from `.dev-outbox.jsonl`.
7. `npx tsx scripts/demo-math.ts` prints Emma's C/K/T/I/V terms and rank against everyone (local DB only).

The screenshot robots and the deck builder (Playwright + pptxgenjs) live outside the repo in `C:\Users\User\overlap-demo`; the finished deck is `Overlap-demo.pptx`.
