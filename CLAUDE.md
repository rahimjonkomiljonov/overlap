@AGENTS.md

# Overlap: campus dating app

Build it step by step from `docs/BUILD_PLAN.md`. The full product spec is `docs/REQUIREMENTS.md`.

## Working protocol

- At the start of a session, read `docs/BUILD_PLAN.md`, find the first unchecked step (`- [ ]`) and do only that step.
- Before coding a step, fetch current docs with Context7 for every library it touches. For Next.js 16 also read the matching guide in `node_modules/next/dist/docs/`.
- A step is done only when every "Done when" check passes. Then tick its box, add a line to the Progress Log in `docs/BUILD_PLAN.md`, and commit as `Sxx: title`.
- Stop at checkpoints C1 to C4 and wait for the owner's review.
- Build only what is in the Month-1 scope map. New ideas go to the Fast-follow list. Split any step that runs past 1.5x its budget.

## Hard rules (privacy and safety)

- **Local-only phase (standing, until the owner says "publish"):** no domain purchase, no Vercel/production deploy, no real email or SMS sending, no Sentry, no signing up new paid services. Build and test against `localhost` only. This overrides any build-plan step that assumes those exist (e.g. S04's email step falls back to logging OTP codes to the server console when `RESEND_API_KEY` is unset). Lift this only when the owner explicitly says to publish/deploy/go live — not implied by finishing a step.
- Never commit secrets. Keys live in `.env.local`; `.env.example` lists names only.
- Never store resident registration numbers. Never log, track or send to a third party: `interested_in`, selfies, chat text.
- Every server action and route handler checks authorization itself; the proxy only routes locales.
- Synthetic users exist only in dev and staging.

## Gotchas (learned the hard way)

- Every page and layout calls `setRequestLocale(locale)` before next-intl server APIs so it stays static. `loading.tsx` cannot, so anything it renders that uses next-intl must be a client component, otherwise the whole route becomes dynamic.
- Korean uses system fonts; only the Latin Pretendard slice is self-hosted (`src/app/fonts/README.md`). Do not add the Hangul webfont slices.
- Windows: never `taskkill /IM <image>`, it kills the owner's own programs (this closed their Chrome once). Stop only PIDs you started yourself. If `.next` is locked (`EBUSY`), find what holds it first.
- Lighthouse: set `CHROME_PATH` to Playwright's Chromium and use `C:/...` style paths for Node on Windows.
- Auth is Better Auth (`src/server/auth/auth.ts`), not Supabase Auth — Supabase Auth's default email sending doesn't fit local-only phase (see BUILD_PLAN S05 log for the full reasoning). The `NEXT_PUBLIC_SUPABASE_*`/`SUPABASE_SECRET_KEY` env vars are for Storage later (S07/S08), unrelated to auth.
- The `(app)` layout guard (S05) redirects signed-out visitors to `/login` and not-yet-onboarded ones to `/onboarding`. **Adding or changing any guard like this: audit existing e2e tests on the newly-protected routes.** They don't fail loudly — they silently keep "passing" while actually testing the redirect target instead (S05 found `shell.spec.ts`/`a11y.spec.ts` tests doing exactly this; one touch-target test would have passed vacuously on an empty locator). Use `signInAndOnboard()` from `e2e/helpers/auth.ts` for tests that need an authenticated session, and add a `toBe(N)` / `toBeGreaterThan(0)` count guard before any loop over a locator, so an empty match can't pass silently.
- Prisma 7 requires a driver adapter for every DB (`@prisma/adapter-pg`) and loads no env file on its own — `prisma.config.ts` loads `.env.local` explicitly. Use `process.env.X` directly there, never `prisma/config`'s `env()` helper: it throws immediately if unset, which breaks `prisma generate` (it needs no DB connection at all) on every clean install, including CI's and Vercel's.
- `prisma migrate dev` does not run `prisma generate` automatically in Prisma 7 — run it explicitly after every schema change or the generated client silently goes stale (wrong fields, confusing type errors). It also refuses to run at all (even with `--create-only`) in a non-interactive shell: use `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script` to get the SQL, hand-place it under `prisma/migrations/<timestamp>_name/migration.sql`, then `prisma migrate deploy` to apply and record it.
- No real campus data exists yet (O4). `prisma/seed.ts` creates a dev-only Campus + `test.ac.kr` EmailDomain for local/CI testing; it refuses to run when `NODE_ENV=production`.
- If you edit server code (actions, `sendEmail`, etc.) after already starting `npm run build`/`npm run start`, the running server is still serving the old build — rebuild and restart before trusting any test result. A test that fails for a suspiciously infrastructural reason (missing file, stale behavior) is worth checking against a fresh build before assuming it's a logic bug.
- CI uses its own throwaway `postgres:17-alpine` service (see `.github/workflows/ci.yml`), never the real Seoul database — don't add real DB credentials as GitHub secrets. New required env vars need a matching dummy (non-secret) value added to the CI workflow's `env:` block, or CI breaks even though local `.env.local` works fine.
- `src/server/env.ts` validates required env vars up front and is imported by `auth.ts` specifically so a missing `BETTER_AUTH_SECRET` fails the build instead of silently falling back to Better Auth's insecure default (which only warns). Import it from any other module that would otherwise fail unclearly on a missing var.
- A design-token pairing like `text-warning-foreground` is calibrated for a _solid_ `bg-warning`; pairing it with a low-opacity tint (`bg-warning/10`) can fail contrast in dark mode even though light mode looks fine. Use `text-foreground` (or `text-warning` for accents only) on tinted/subtle variants — see `src/components/draft-notice.tsx`.

## Commands

- `npm run dev` starts the app, `npm run check` runs lint, typecheck and unit tests, `npm run e2e` runs Playwright.
- `npm run db:migrate -- --name X` after a schema change, then `npx prisma generate`. `npm run db:seed` for the dev fixture. `npm run db:studio` to browse the database.
- Next.js 16: `src/proxy.ts` replaces `middleware.ts`. Korean is served at `/`, English at `/en`.
