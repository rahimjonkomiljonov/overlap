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
- Auth is not in place until S05; the `(app)` pages are placeholders.

## Commands

- `npm run dev` starts the app, `npm run check` runs lint, typecheck and unit tests, `npm run e2e` runs Playwright.
- Next.js 16: `src/proxy.ts` replaces `middleware.ts`. Korean is served at `/`, English at `/en`.
